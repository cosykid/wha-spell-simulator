/**
 * @file The medium's motes: a few dozen short speed-strokes of the seal's own
 * element, leaning toward the ring.
 *
 * They are instanced billboards rather than dots, and they are stretched along
 * the way they lean, so what the eye reads is a direction rather than a count.
 * That is the whole difference between a medium and the field of faint dots the
 * cell stage was built to replace, so the stretch is not decoration.
 *
 * One draw call, no per-frame allocation: every mote's home is baked into an
 * instanced attribute and the vertex shader draws it in from there.
 *
 * @example
 * const motes = createMediumMotes({ look, motes: seeds });
 * motes.setDrift({ inhale: 0.4, alpha: 0.2, tS: 1.1, wander: 0.05 });
 */

import * as THREE from 'three';
import { inkBlending, inkColor } from '../ink.js';
import type { Vec3 } from '../../../types.js';
import type { Look } from '../../looks/look.js';

/** How long a mote runs compared to how wide it is, at rest and at full rush. */
const STREAK = { calm: 1.8, rushing: 6.5 } as const;

/** Where one mote sits when nothing is pulling on it. */
export interface MoteSeed {
	/** Seal space, out past the ring: the medium fills the domain, not the valve. */
	home: Vec3;
	/** Seal units across. */
	size: number;
	/** Radians of offset into the idle curl, so no two motes drift together. */
	phase: number;
}

const VERTEX_SHADER = /* glsl */ `
	uniform float uInhale;
	uniform float uRim;
	uniform float uCeiling;
	uniform float uWander;
	uniform float uTime;
	uniform float uStretch;
	attribute vec3 aHome;
	attribute float aSize;
	attribute float aPhase;
	varying vec2 vUv;

	void main() {
		vec2 home = aHome.xy;
		float arm = max(length(home), 0.001);
		vec2 lean = -home / arm;
		// R-01's inhale: the medium draws in along its own bearing and rises to the
		// height it hovers at, so the whole field converges on the ring at once.
		vec2 at = mix(home, -lean * uRim, uInhale);
		float height = mix(aHome.z, uCeiling, uInhale);
		at += vec2(sin(uTime * 0.7 + aPhase), cos(uTime * 0.61 + aPhase * 1.7)) * uWander;

		vec4 viewPosition = modelViewMatrix * vec4(at, height, 1.0);
		// Stretch along the lean, seen from wherever the camera is.
		vec3 leanView = mat3(modelViewMatrix) * vec3(lean, 0.0);
		vec2 axis = length(leanView.xy) > 0.001 ? normalize(leanView.xy) : vec2(1.0, 0.0);
		vec2 across = vec2(-axis.y, axis.x);
		float streak = mix(${STREAK.calm.toFixed(1)}, ${STREAK.rushing.toFixed(1)}, uStretch);
		viewPosition.xy += axis * (position.x * aSize * streak) + across * (position.y * aSize);
		vUv = uv;
		gl_Position = projectionMatrix * viewPosition;
	}
`;

const FRAGMENT_SHADER = /* glsl */ `
	uniform vec3 uCore;
	uniform vec3 uEdge;
	uniform float uAlpha;
	varying vec2 vUv;

	void main() {
		vec2 p = vUv * 2.0 - 1.0;
		float body = 1.0 - clamp(length(p), 0.0, 1.0);
		// Brightest at the leading end, so a still frame says which way it goes.
		float head = smoothstep(-1.0, 1.0, -p.x);
		float alpha = uAlpha * pow(body, 1.5) * (0.4 + 0.6 * head);
		if (alpha < 0.003) discard;
		gl_FragColor = vec4(mix(uEdge, uCore, body * head), alpha);
		#include <tonemapping_fragment>
		#include <colorspace_fragment>
	}
`;

/** The medium this frame. */
export interface DriftState {
	/** 0..1, how far the medium has drawn in toward the ring. */
	inhale: number;
	alpha: number;
	/** 0..1, how fast it is moving, which is how far each stroke is drawn out. */
	stretch: number;
	/** Seconds on the cast clock, driving the idle curl. */
	tS: number;
	/** Seal units of that curl. */
	wander: number;
}

export interface MediumMotes {
	readonly mesh: THREE.Mesh;
	setDrift(state: DriftState): void;
	dispose(): void;
}

export function createMediumMotes(options: {
	look: Look;
	motes: readonly MoteSeed[];
	/** Seal units the medium gathers to: the ring the seal was drawn as. */
	rim: number;
	/** Seal units above the paper it hovers at once gathered. */
	ceiling: number;
}): MediumMotes {
	const quad = new THREE.PlaneGeometry(1, 1);
	const geometry = new THREE.InstancedBufferGeometry();
	geometry.index = quad.index;
	geometry.setAttribute('position', quad.attributes.position);
	geometry.setAttribute('uv', quad.attributes.uv);
	geometry.instanceCount = options.motes.length;

	const home = new Float32Array(options.motes.length * 3);
	const size = new Float32Array(options.motes.length);
	const phase = new Float32Array(options.motes.length);
	options.motes.forEach((mote, index) => {
		home[index * 3] = mote.home.x;
		home[index * 3 + 1] = mote.home.y;
		home[index * 3 + 2] = mote.home.z;
		size[index] = mote.size;
		phase[index] = mote.phase;
	});
	geometry.setAttribute('aHome', new THREE.InstancedBufferAttribute(home, 3));
	geometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 1));
	geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));

	const material = new THREE.ShaderMaterial({
		uniforms: {
			uInhale: { value: 0 },
			uAlpha: { value: 0 },
			uStretch: { value: 0 },
			uTime: { value: 0 },
			uWander: { value: 0 },
			uRim: { value: options.rim },
			uCeiling: { value: options.ceiling },
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
		setDrift(state) {
			material.uniforms.uInhale.value = state.inhale;
			material.uniforms.uAlpha.value = state.alpha;
			material.uniforms.uStretch.value = state.stretch;
			material.uniforms.uTime.value = state.tS;
			material.uniforms.uWander.value = state.wander;
			mesh.visible = state.alpha > 0;
		},
		dispose() {
			quad.dispose();
			geometry.dispose();
			material.dispose();
		}
	};
}
