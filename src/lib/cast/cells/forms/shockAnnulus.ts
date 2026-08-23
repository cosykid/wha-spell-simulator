/**
 * @file The shock annulus: an expanding ring of ink lying in the seal plane.
 *
 * Real geometry, not a sprite. A strip of quads carries two attributes — where a
 * vertex sits across the band and where it sits around it — and the vertex
 * shader builds the ring from them each frame, so the form expands and thins
 * without a geometry rebuild.
 *
 * The scallops on the rim and the licks in the shading read the **same phase**,
 * and that phase advances with the radius the ring expands by. That is the PR
 * #76 rule that makes motion legible in a still frame.
 *
 * @example
 * const shock = createShockAnnulus({ look, lobes: 7, phase: 1.2 });
 * shock.mesh.name = 'burst-shock';
 * shock.setRing({ inner: 0.6, outer: 0.9, alpha: 0.8 });
 */

import * as THREE from 'three';
import { inkBlending, inkColor } from '../ink.js';
import type { Look } from '../../looks/look.js';

/** Quads around the ring. Enough that the rim reads as a curve, not a polygon. */
const SEGMENTS = 144;

/** How far the scalloped rim may wander, as a fraction of the ring radius. */
const WAVE_AMPLITUDE = 0.035;

const VERTEX_SHADER = /* glsl */ `
	uniform float uInner;
	uniform float uOuter;
	uniform float uWaveAmplitude;
	uniform float uLobes;
	uniform float uPhase;
	attribute float aRadial;
	attribute float aAngle;
	varying float vRadial;
	varying float vAngle;

	void main() {
		float wave = sin(aAngle * uLobes + uPhase);
		float radius = mix(uInner, uOuter, aRadial) * (1.0 + uWaveAmplitude * wave);
		vec3 seal = vec3(cos(aAngle) * radius, sin(aAngle) * radius, 0.0);
		vRadial = aRadial;
		vAngle = aAngle;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(seal, 1.0);
	}
`;

const FRAGMENT_SHADER = /* glsl */ `
	uniform vec3 uCore;
	uniform vec3 uEdge;
	uniform float uAlpha;
	uniform float uLobes;
	uniform float uPhase;
	varying float vRadial;
	varying float vAngle;

	void main() {
		// The shock front is a line, not a wash: brightness piles into the outer
		// sixth of the band and feathers off the very rim. A broad soft ramp
		// disappears into bright paper, which is what the seal is drawn on.
		float front = smoothstep(0.62, 0.95, vRadial) * (1.0 - smoothstep(0.95, 1.0, vRadial));
		// Behind it, the much fainter scorch the front dragged out.
		float scorch = 0.2 * smoothstep(0.0, 0.55, vRadial);
		// Same lobes, same phase as the rim the geometry builds, so the licks sit
		// on the scallops instead of sliding under them.
		float licks = 0.72 + 0.28 * sin(vAngle * uLobes + uPhase);
		float alpha = uAlpha * (front + scorch) * licks;
		if (alpha < 0.002) discard;
		gl_FragColor = vec4(mix(uEdge, uCore, front), alpha);
		#include <tonemapping_fragment>
		#include <colorspace_fragment>
	}
`;

/** Where the band sits this frame, in seal units. */
export interface ShockRing {
	inner: number;
	outer: number;
	alpha: number;
	/** Radians. Advanced by the caller from the same radius the ring expands by. */
	phase: number;
	/** Seal units above the paper. Small: the shock hugs the plane. */
	height: number;
}

export interface ShockAnnulus {
	readonly mesh: THREE.Mesh;
	setRing(ring: ShockRing): void;
	dispose(): void;
}

function annulusGeometry(): THREE.BufferGeometry {
	const vertices = (SEGMENTS + 1) * 2;
	const position = new Float32Array(vertices * 3);
	const radial = new Float32Array(vertices);
	const angle = new Float32Array(vertices);

	for (let ring = 0; ring < 2; ring += 1) {
		for (let i = 0; i <= SEGMENTS; i += 1) {
			const index = ring * (SEGMENTS + 1) + i;
			const theta = (i / SEGMENTS) * Math.PI * 2;
			radial[index] = ring;
			angle[index] = theta;
			// The vertex shader places the real point; this is only here so the
			// geometry has the `position` attribute three expects.
			position[index * 3] = Math.cos(theta);
			position[index * 3 + 1] = Math.sin(theta);
		}
	}

	const indices: number[] = [];
	for (let i = 0; i < SEGMENTS; i += 1) {
		const inner = i;
		const outer = SEGMENTS + 1 + i;
		indices.push(inner, outer, outer + 1, inner, outer + 1, inner + 1);
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
	geometry.setAttribute('aRadial', new THREE.BufferAttribute(radial, 1));
	geometry.setAttribute('aAngle', new THREE.BufferAttribute(angle, 1));
	geometry.setIndex(indices);
	return geometry;
}

/**
 * One annulus, built from a look, a seeded lobe count, and how ragged its rim
 * runs (0 is a machined circle, 1 is the full scallop). The caller owns the
 * ring's motion and calls {@link ShockAnnulus.setRing} once per step.
 */
export function createShockAnnulus(options: {
	look: Look;
	lobes: number;
	roughness: number;
}): ShockAnnulus {
	const geometry = annulusGeometry();
	const material = new THREE.ShaderMaterial({
		uniforms: {
			uInner: { value: 0 },
			uOuter: { value: 0 },
			uWaveAmplitude: { value: WAVE_AMPLITUDE * options.roughness },
			uLobes: { value: options.lobes },
			uPhase: { value: 0 },
			uAlpha: { value: 0 },
			uCore: { value: inkColor(options.look.tint.core) },
			uEdge: { value: inkColor(options.look.tint.edge) }
		},
		vertexShader: VERTEX_SHADER,
		fragmentShader: FRAGMENT_SHADER,
		transparent: true,
		depthWrite: false,
		// The seal root's matrix is a reflection, so every triangle under it winds
		// the other way. Draw both sides rather than reversing the indices.
		side: THREE.DoubleSide,
		blending: inkBlending(options.look)
	});

	const mesh = new THREE.Mesh(geometry, material);
	// The shader moves the vertices, so the geometry's own bounds say nothing
	// about where the ring is.
	mesh.frustumCulled = false;

	return {
		mesh,
		setRing(ring) {
			material.uniforms.uInner.value = ring.inner;
			material.uniforms.uOuter.value = ring.outer;
			material.uniforms.uPhase.value = ring.phase;
			material.uniforms.uAlpha.value = ring.alpha;
			mesh.position.z = ring.height;
			mesh.visible = ring.alpha > 0;
		},
		dispose() {
			geometry.dispose();
			material.dispose();
		}
	};
}
