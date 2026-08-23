/**
 * @file The orbit rings: thin bands of ink turning slowly around a held place.
 *
 * Every ring is one flat annulus lying in its own tilted plane. The plane is
 * baked into the geometry as the two basis vectors each vertex is built from, so
 * all of them are one mesh, one material and one draw call, and the vertex shader
 * only has to add the spin phase to the angle.
 *
 * The dashes in the shading are cut at the **same** angle the geometry is placed
 * at, so they turn with the ring rather than sliding under it. That is what makes
 * a rotor read as turning in a still frame, which is R-16's whole visible claim.
 *
 * @example
 * const rings = createOrbitRings({ look, material, rings: placements });
 * rings.setRings({ radius: 0.4, width: 0.03, alpha: 0.7, spin: 2.1, bob: 0.5 });
 */

import * as THREE from 'three';
import { inkBlending, inkColor } from '../ink.js';
import { clamp } from '../../../utils/geometry.js';
import type { Look, MaterialProfile } from '../../looks/look.js';

/** Quads around one ring. Enough that the band reads as a curve. */
const SEGMENTS = 96;

/** Lobes a material with no bands of its own still shows, so an ink ring is never a hoop. */
const PLAIN_LOBES = 4;

/** Where one ring's plane sits, and how fast it takes the hold's spin. */
export interface RingPlacement {
	/** Radians the ring's plane leans off the seal plane. */
	tilt: number;
	/** Radians the leaned plane is turned about the seal axis. */
	twist: number;
	/** Fraction of the shell radius the ring orbits at. */
	radius: number;
	/** Fraction of the hold's spin this ring takes, so the rings never lock. */
	speed: number;
}

const VERTEX_SHADER = /* glsl */ `
	uniform float uRadius;
	uniform float uWidth;
	uniform float uSpin;
	uniform float uBob;
	uniform float uUndulation;
	attribute vec3 aU;
	attribute vec3 aV;
	attribute float aAngle;
	attribute float aBand;
	attribute float aRadius;
	attribute float aSpeed;
	varying float vTheta;
	varying float vBand;

	void main() {
		float theta = aAngle + uSpin * aSpeed;
		float wobble = 1.0 + uUndulation * 0.05 * sin(theta * 3.0 + uBob);
		float radius = aRadius * uRadius * wobble + aBand * uWidth;
		vec3 seal = (cos(theta) * aU + sin(theta) * aV) * radius;
		vTheta = theta;
		vBand = aBand;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(seal, 1.0);
	}
`;

const FRAGMENT_SHADER = /* glsl */ `
	uniform vec3 uCore;
	uniform vec3 uEdge;
	uniform float uAlpha;
	uniform float uLobes;
	uniform float uDepth;
	varying float vTheta;
	varying float vBand;

	void main() {
		// Across the band: an ink line is flat through the middle and feathers only
		// at its two sides. A broad ramp is a smoke ring, not a drawn one.
		float across = 1.0 - abs(vBand);
		float ink = smoothstep(0.0, 0.3, across);
		// Cut at the placed angle, so the dashes are part of the ring, not a
		// pattern the ring slides beneath.
		float dash = 1.0 - uDepth + uDepth * pow(0.5 + 0.5 * sin(vTheta * uLobes), 1.6);
		float alpha = uAlpha * ink * dash;
		if (alpha < 0.003) discard;
		gl_FragColor = vec4(mix(uEdge, uCore, ink * dash), alpha);
		#include <tonemapping_fragment>
		#include <colorspace_fragment>
	}
`;

/** The rings this frame, in seal units. */
export interface RingsState {
	/** Seal units the outermost ring orbits at. */
	radius: number;
	/** Seal units across one band. */
	width: number;
	alpha: number;
	/** Radians of accumulated spin. The dashes read this too. */
	spin: number;
	/** Radians of the bob the hold breathes by. */
	bob: number;
}

export interface OrbitRings {
	readonly mesh: THREE.Mesh;
	setRings(state: RingsState): void;
	dispose(): void;
}

/** One buffer holding every ring, each with its own plane baked into its vertices. */
function ringsGeometry(placements: readonly RingPlacement[]): THREE.BufferGeometry {
	const perRing = (SEGMENTS + 1) * 2;
	const count = perRing * placements.length;
	const position = new Float32Array(count * 3);
	const u = new Float32Array(count * 3);
	const v = new Float32Array(count * 3);
	const angle = new Float32Array(count);
	const band = new Float32Array(count);
	const radius = new Float32Array(count);
	const speed = new Float32Array(count);
	const indices: number[] = [];

	const basisU = new THREE.Vector3();
	const basisV = new THREE.Vector3();
	const plane = new THREE.Matrix4();

	placements.forEach((placement, ring) => {
		plane.makeRotationFromEuler(new THREE.Euler(placement.tilt, 0, placement.twist, 'ZXY'));
		basisU.set(1, 0, 0).applyMatrix4(plane);
		basisV.set(0, 1, 0).applyMatrix4(plane);
		for (let side = 0; side < 2; side += 1) {
			for (let i = 0; i <= SEGMENTS; i += 1) {
				const index = ring * perRing + side * (SEGMENTS + 1) + i;
				const theta = (i / SEGMENTS) * Math.PI * 2;
				angle[index] = theta;
				band[index] = side * 2 - 1;
				radius[index] = placement.radius;
				speed[index] = placement.speed;
				basisU.toArray(u, index * 3);
				basisV.toArray(v, index * 3);
				// The vertex shader places the real point; `position` only exists
				// because three expects the attribute.
				position[index * 3] = Math.cos(theta);
				position[index * 3 + 1] = Math.sin(theta);
			}
		}
		for (let i = 0; i < SEGMENTS; i += 1) {
			const inner = ring * perRing + i;
			const outer = inner + SEGMENTS + 1;
			indices.push(inner, outer, outer + 1, inner, outer + 1, inner + 1);
		}
	});

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
	geometry.setAttribute('aU', new THREE.BufferAttribute(u, 3));
	geometry.setAttribute('aV', new THREE.BufferAttribute(v, 3));
	geometry.setAttribute('aAngle', new THREE.BufferAttribute(angle, 1));
	geometry.setAttribute('aBand', new THREE.BufferAttribute(band, 1));
	geometry.setAttribute('aRadius', new THREE.BufferAttribute(radius, 1));
	geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
	geometry.setIndex(indices);
	return geometry;
}

export function createOrbitRings(options: {
	look: Look;
	material: MaterialProfile;
	rings: readonly RingPlacement[];
}): OrbitRings {
	const geometry = ringsGeometry(options.rings);
	const bands = options.material.bands;
	const material = new THREE.ShaderMaterial({
		uniforms: {
			uRadius: { value: 0 },
			uWidth: { value: 0 },
			uAlpha: { value: 0 },
			uSpin: { value: 0 },
			uBob: { value: 0 },
			uUndulation: { value: options.material.undulation },
			// A banded material shows its own count; a plain one still gets enough
			// break-up that the ring is ink rather than a machined hoop.
			uLobes: { value: bands > 0 ? bands : PLAIN_LOBES },
			uDepth: { value: 0.3 + 0.5 * clamp(bands / 8) },
			uCore: { value: inkColor(options.look.tint.core) },
			uEdge: { value: inkColor(options.look.tint.edge) }
		},
		vertexShader: VERTEX_SHADER,
		fragmentShader: FRAGMENT_SHADER,
		transparent: true,
		depthWrite: false,
		side: THREE.DoubleSide,
		blending: inkBlending(options.look)
	});

	const mesh = new THREE.Mesh(geometry, material);
	mesh.frustumCulled = false;

	return {
		mesh,
		setRings(state) {
			material.uniforms.uRadius.value = state.radius;
			material.uniforms.uWidth.value = state.width;
			material.uniforms.uAlpha.value = state.alpha;
			material.uniforms.uSpin.value = state.spin;
			material.uniforms.uBob.value = state.bob;
			mesh.visible = state.alpha > 0 && state.radius > 0;
		},
		dispose() {
			geometry.dispose();
			material.dispose();
		}
	};
}
