/**
 * @file The haze disc: the thin ambient medium as one soft macroscopic shape
 * lying on the seal plane, so the medium reads as a volume of air and not as a
 * scatter of specks.
 *
 * It is a broad ring of haze whose peak radius is where the medium is currently
 * pooled. Drawing that peak inward is R-01's charge made visible: the whole plane
 * gathers toward the seal before anything else in the cast exists.
 *
 * Its lobes turn on the same phase the peak moves by, so the gather is legible in
 * a still frame.
 *
 * @example
 * const haze = createHazeDisc({ look, lobes: 5 });
 * haze.setHaze({ peak: 1.2, width: 0.5, alpha: 0.08, phase: 0.4 });
 */

import * as THREE from 'three';
import { inkBlending, inkColor } from '../ink.js';
import type { Look } from '../../looks/look.js';

/** Seal units the disc spans. The medium fills the domain, not the ring. */
export const HAZE_SPAN = 2.6;

/** Seal units above the paper, so the haze is in the air rather than on it. */
const HAZE_HEIGHT = 0.02;

const VERTEX_SHADER = /* glsl */ `
	varying float vRadius;
	varying float vAngle;

	void main() {
		vRadius = length(position.xy);
		vAngle = atan(position.y, position.x);
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`;

const FRAGMENT_SHADER = /* glsl */ `
	uniform vec3 uCore;
	uniform vec3 uEdge;
	uniform float uAlpha;
	uniform float uPeak;
	uniform float uWidth;
	uniform float uLobes;
	uniform float uPhase;
	varying float vRadius;
	varying float vAngle;

	void main() {
		// One soft band, pooled wherever the medium currently is.
		float band = exp(-pow((vRadius - uPeak) / max(uWidth, 0.02), 2.0));
		// And a broad wash inside it, so the plane under the seal is not a hole.
		float wash = 0.22 * (1.0 - smoothstep(0.0, uPeak, vRadius));
		float lobes = 0.82 + 0.18 * sin(vAngle * uLobes + uPhase);
		float alpha = uAlpha * (band + wash) * lobes;
		if (alpha < 0.002) discard;
		gl_FragColor = vec4(mix(uEdge, uCore, band), alpha);
		#include <tonemapping_fragment>
		#include <colorspace_fragment>
	}
`;

/** Where the haze is pooled this frame, in seal units. */
export interface HazeState {
	/** Radius the band peaks at. */
	peak: number;
	/** Seal units the band is spread over. */
	width: number;
	alpha: number;
	/** Radians. Advanced by the caller from the same gather the peak moves by. */
	phase: number;
}

export interface HazeDisc {
	readonly mesh: THREE.Mesh;
	setHaze(state: HazeState): void;
	dispose(): void;
}

export function createHazeDisc(options: { look: Look; lobes: number }): HazeDisc {
	const geometry = new THREE.CircleGeometry(HAZE_SPAN, 96);
	const material = new THREE.ShaderMaterial({
		uniforms: {
			uAlpha: { value: 0 },
			uPeak: { value: 0 },
			uWidth: { value: 0.5 },
			uPhase: { value: 0 },
			uLobes: { value: options.lobes },
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
	mesh.position.z = HAZE_HEIGHT;
	mesh.frustumCulled = false;

	return {
		mesh,
		setHaze(state) {
			material.uniforms.uPeak.value = state.peak;
			material.uniforms.uWidth.value = state.width;
			material.uniforms.uAlpha.value = state.alpha;
			material.uniforms.uPhase.value = state.phase;
			mesh.visible = state.alpha > 0;
		},
		dispose() {
			geometry.dispose();
			material.dispose();
		}
	};
}
