/**
 * @file The tether wisps: faint strands of ink bowing from the seal rim up to a
 * held ball, so the thing hanging in the air is visibly hanging from the seal
 * that holds it rather than floating on its own.
 *
 * Each wisp is a thin bowed strip. Its two ends are baked in — a rim anchor in
 * the seal plane and, at the far end, the point on the shell's surface directly
 * along that bearing — and the vertex shader interpolates between them, so the
 * strands follow the ball as it breathes without a geometry rebuild.
 *
 * @example
 * const wisps = createTetherWisps({ look, material, strands });
 * wisps.setWisps({ at, stop: 0.3, alpha: 0.2, width: 0.05, phase: 1.2 });
 */

import * as THREE from 'three';
import { inkBlending, inkColor } from '../ink.js';
import type { Vec3 } from '../../../types.js';
import type { Look, MaterialProfile } from '../../looks/look.js';

/** Segments along one strand. Enough that the bow is a curve. */
const SEGMENTS = 24;

/** Seal units the rim anchors sit out at: the ring the seal was drawn as. */
const RIM_RADIUS = 1;

/** Beads of ink running up one strand. */
const BEADS = 3;

/** One strand's anchor on the seal rim, and how far it bows off the straight line. */
export interface WispStrand {
	/** Radians around the seal, from +x. */
	bearing: number;
	/** -1..1. How hard the strand bows, and which way it sways. */
	bow: number;
}

const VERTEX_SHADER = /* glsl */ `
	uniform vec3 uAt;
	uniform float uStop;
	uniform float uWidth;
	uniform float uArc;
	uniform float uPhase;
	attribute vec3 aRim;
	attribute vec3 aSide;
	attribute float aT;
	attribute float aEdge;
	attribute float aBow;
	varying float vT;
	varying float vEdge;

	void main() {
		// The far end is the shell's surface along this strand's own bearing, so a
		// breathing ball never swallows its tethers or floats free of them.
		vec3 target = uAt + normalize(aRim - uAt) * uStop;
		vec3 seal = mix(aRim, target, aT);
		float bow = sin(aT * 3.14159265);
		seal.z += uArc * abs(aBow) * bow;
		seal += aSide * (uWidth * 4.0 * aBow * bow * sin(uPhase * 0.5));
		seal += aSide * (aEdge * uWidth * (1.0 - 0.6 * aT));
		vT = aT;
		vEdge = aEdge;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(seal, 1.0);
	}
`;

const FRAGMENT_SHADER = /* glsl */ `
	uniform vec3 uCore;
	uniform vec3 uEdge;
	uniform float uAlpha;
	uniform float uPhase;
	uniform float uBeads;
	varying float vT;
	varying float vEdge;

	void main() {
		float ink = smoothstep(0.0, 0.55, 1.0 - abs(vEdge));
		// Neither end is a cut: the strand condenses out of the rim and dissolves
		// into the shell.
		float ends = smoothstep(0.0, 0.2, vT) * (1.0 - smoothstep(0.78, 1.0, vT));
		// Beads climbing toward the ball, on the same phase the ball turns by.
		float bead = 0.4 + 0.6 * pow(max(0.0, sin(vT * 6.2831853 * uBeads - uPhase)), 3.0);
		float alpha = uAlpha * ink * ends * bead;
		if (alpha < 0.003) discard;
		gl_FragColor = vec4(mix(uEdge, uCore, ink * bead), alpha);
		#include <tonemapping_fragment>
		#include <colorspace_fragment>
	}
`;

/** The wisps this frame, in seal units. */
export interface WispsState {
	/** The held ball's center. */
	at: Vec3;
	/** Seal units of shell the strands stop on. */
	stop: number;
	alpha: number;
	/** Seal units of half-width at the rim end. */
	width: number;
	/** Radians. The beads and the sway both read it. */
	phase: number;
}

export interface TetherWisps {
	readonly mesh: THREE.Mesh;
	setWisps(state: WispsState): void;
	dispose(): void;
}

function wispsGeometry(strands: readonly WispStrand[]): THREE.BufferGeometry {
	const perStrand = (SEGMENTS + 1) * 2;
	const count = perStrand * strands.length;
	const position = new Float32Array(count * 3);
	const rim = new Float32Array(count * 3);
	const side = new Float32Array(count * 3);
	const along = new Float32Array(count);
	const edge = new Float32Array(count);
	const bow = new Float32Array(count);
	const indices: number[] = [];

	strands.forEach((strand, index) => {
		const cos = Math.cos(strand.bearing);
		const sin = Math.sin(strand.bearing);
		for (let lane = 0; lane < 2; lane += 1) {
			for (let i = 0; i <= SEGMENTS; i += 1) {
				const at = index * perStrand + lane * (SEGMENTS + 1) + i;
				const t = i / SEGMENTS;
				rim[at * 3] = cos * RIM_RADIUS;
				rim[at * 3 + 1] = sin * RIM_RADIUS;
				// In-plane perpendicular to the bearing: the strand sways sideways
				// across the seal rather than toward or away from the ball.
				side[at * 3] = -sin;
				side[at * 3 + 1] = cos;
				along[at] = t;
				edge[at] = lane * 2 - 1;
				bow[at] = strand.bow;
				position[at * 3] = cos;
				position[at * 3 + 1] = sin;
			}
		}
		for (let i = 0; i < SEGMENTS; i += 1) {
			const left = index * perStrand + i;
			const right = left + SEGMENTS + 1;
			indices.push(left, right, right + 1, left, right + 1, left + 1);
		}
	});

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
	geometry.setAttribute('aRim', new THREE.BufferAttribute(rim, 3));
	geometry.setAttribute('aSide', new THREE.BufferAttribute(side, 3));
	geometry.setAttribute('aT', new THREE.BufferAttribute(along, 1));
	geometry.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
	geometry.setAttribute('aBow', new THREE.BufferAttribute(bow, 1));
	geometry.setIndex(indices);
	return geometry;
}

export function createTetherWisps(options: {
	look: Look;
	material: MaterialProfile;
	strands: readonly WispStrand[];
}): TetherWisps {
	const geometry = wispsGeometry(options.strands);
	const material = new THREE.ShaderMaterial({
		uniforms: {
			uAt: { value: new THREE.Vector3() },
			uStop: { value: 0 },
			uAlpha: { value: 0 },
			uWidth: { value: 0 },
			uPhase: { value: 0 },
			// A heavy material's tethers sag; a weightless one's stand almost straight.
			uArc: { value: 0.1 + 0.35 * options.material.weight },
			uBeads: { value: BEADS },
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
		setWisps(state) {
			const at = material.uniforms.uAt.value as THREE.Vector3;
			at.set(state.at.x, state.at.y, state.at.z);
			material.uniforms.uStop.value = state.stop;
			material.uniforms.uAlpha.value = state.alpha;
			material.uniforms.uWidth.value = state.width;
			material.uniforms.uPhase.value = state.phase;
			mesh.visible = state.alpha > 0;
		},
		dispose() {
			geometry.dispose();
			material.dispose();
		}
	};
}
