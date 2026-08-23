/**
 * @file The funnel's floor: the boundary layer feeding its foot, and the ring
 * that marks the eye.
 *
 * A disc of ink lying in the seal plane, shaded with spiral streaks that sweep
 * inward toward the foot. It carries the two halves of the branch's Rankine cell
 * that the arms cannot draw: the **floor inflow** (matter arriving along the
 * paper, which is what keeps the whirl fed) and the **eye** (a bright ring at the
 * foot radius with nothing inside it, so the hollow reads as deliberate calm
 * rather than as a gap in the ink).
 *
 * The streaks read the same arm count and the same spin phase the arms turn by,
 * so floor and funnel rotate as one body.
 *
 * @example
 * const floor = createVortexFloor({ look, material, arms: 5 });
 * floor.setInflow({ eye: 0.28, reach: 1.7, phase: 1.2, curl: 3.4, alpha: 0.5 });
 */

import * as THREE from 'three';
import { inkBlending, inkColor } from '../ink.js';
import type { Look, MaterialProfile } from '../../looks/look.js';

/** Quads around the disc. Enough that the streaks stay curves at the rim. */
const SEGMENTS = 132;

/** Rings across it. The streaks bend, so the radial direction needs samples too. */
const RINGS = 12;

const VERTEX_SHADER = /* glsl */ `
	uniform float uEye;
	uniform float uReach;
	attribute float aRadial;
	attribute float aAngle;
	varying float vRadial;
	varying float vAngle;

	void main() {
		float radius = mix(uEye, uReach, aRadial);
		vRadial = aRadial;
		vAngle = aAngle;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(cos(aAngle) * radius, sin(aAngle) * radius, 0.0, 1.0);
	}
`;

const FRAGMENT_SHADER = /* glsl */ `
	uniform vec3 uCore;
	uniform vec3 uEdge;
	uniform float uAlpha;
	uniform float uArms;
	uniform float uPhase;
	uniform float uCurl;
	uniform float uEyeWidth;
	uniform float uNoise;
	varying float vRadial;
	varying float vAngle;

	void main() {
		// One spiral per arm, turning with the arms and trailing back the way the
		// funnel spins. Signed curl is what makes the sweep follow the rotation.
		float spiral = uArms * (vAngle - uPhase) + uCurl * vRadial;
		float streak = pow(0.5 + 0.5 * sin(spiral), 4.0);
		// The boundary layer is thin: it piles up near the foot and is gone by the
		// time it reaches the rim, so it never becomes a floor-wide wash.
		float layer = smoothstep(0.0, 0.12, vRadial) * (1.0 - smoothstep(0.25, 0.85, vRadial));
		// The eye wall itself: one bright line at the foot with nothing inside it.
		float wall = exp(-(vRadial * vRadial) / (uEyeWidth * uEyeWidth));
		float grain = 1.0 - uNoise * 0.35 * (0.5 + 0.5 * sin(spiral * 2.0 + vRadial * 23.0));

		float alpha = uAlpha * (streak * layer * grain * 1.5 + wall * 0.5);
		if (alpha < 0.003) discard;
		gl_FragColor = vec4(mix(uEdge, uCore, wall), alpha);
		#include <tonemapping_fragment>
		#include <colorspace_fragment>
	}
`;

/** Where the floor's inflow sits this frame, in seal units and radians. */
export interface Inflow {
	/** The eye's radius: the disc starts here, so the hollow is never painted. */
	eye: number;
	/** Seal units out to which the boundary layer is drawn. */
	reach: number;
	/** Radians of spin, the same value the arms are given. */
	phase: number;
	/** Signed radians the streaks bend across the disc. */
	curl: number;
	alpha: number;
}

export interface VortexFloor {
	readonly mesh: THREE.Mesh;
	setInflow(inflow: Inflow): void;
	dispose(): void;
}

function floorGeometry(): THREE.BufferGeometry {
	const vertices = (SEGMENTS + 1) * (RINGS + 1);
	const position = new Float32Array(vertices * 3);
	const radial = new Float32Array(vertices);
	const angle = new Float32Array(vertices);
	const indices: number[] = [];

	for (let ring = 0; ring <= RINGS; ring += 1) {
		for (let i = 0; i <= SEGMENTS; i += 1) {
			const index = ring * (SEGMENTS + 1) + i;
			const theta = (i / SEGMENTS) * Math.PI * 2;
			radial[index] = ring / RINGS;
			angle[index] = theta;
			position[index * 3] = Math.cos(theta);
			position[index * 3 + 1] = Math.sin(theta);
			if (ring < RINGS && i < SEGMENTS) {
				const next = index + SEGMENTS + 1;
				indices.push(index, next, next + 1, index, next + 1, index + 1);
			}
		}
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
	geometry.setAttribute('aRadial', new THREE.BufferAttribute(radial, 1));
	geometry.setAttribute('aAngle', new THREE.BufferAttribute(angle, 1));
	geometry.setIndex(indices);
	return geometry;
}

/** The disc the funnel stands on, built from a look and the funnel's arm count. */
export function createVortexFloor(options: {
	look: Look;
	material: MaterialProfile;
	arms: number;
}): VortexFloor {
	const geometry = floorGeometry();
	const material = new THREE.ShaderMaterial({
		uniforms: {
			uEye: { value: 0 },
			uReach: { value: 0 },
			uAlpha: { value: 0 },
			uArms: { value: options.arms },
			uPhase: { value: 0 },
			uCurl: { value: 0 },
			// A crisp material draws a hairline eye; a feathered one draws a halo.
			uEyeWidth: { value: options.material.edge === 'feather' ? 0.16 : 0.07 },
			uNoise: { value: Math.min(1, options.material.noiseScale / 3) },
			uCore: { value: inkColor(options.look.tint.core) },
			uEdge: { value: inkColor(options.look.tint.edge) }
		},
		vertexShader: VERTEX_SHADER,
		fragmentShader: FRAGMENT_SHADER,
		transparent: true,
		depthWrite: false,
		// The seal root's matrix is a reflection, so culling would hide the disc.
		side: THREE.DoubleSide,
		blending: inkBlending(options.look)
	});

	const mesh = new THREE.Mesh(geometry, material);
	mesh.name = 'vortex-floor';
	mesh.frustumCulled = false;

	return {
		mesh,
		setInflow(inflow) {
			material.uniforms.uEye.value = inflow.eye;
			material.uniforms.uReach.value = inflow.reach;
			material.uniforms.uPhase.value = inflow.phase;
			material.uniforms.uCurl.value = inflow.curl;
			material.uniforms.uAlpha.value = inflow.alpha;
			mesh.visible = inflow.alpha > 0;
		},
		dispose() {
			geometry.dispose();
			material.dispose();
		}
	};
}
