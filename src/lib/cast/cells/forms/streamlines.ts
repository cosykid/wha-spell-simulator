/**
 * @file Streamlines: long curved ink strokes showing which way the world is
 * moving around a seal.
 *
 * Each stroke is a tapered ribbon — thick at the head it is being pulled by,
 * gone at the tail — riding a curve from one radius to another. The vertex
 * shader evaluates that curve twice, once here and once a step ahead, and offsets
 * across the tangent it gets, so a stroke stays a stroke however hard it bends.
 *
 * There are dozens of them, never thousands, and they are drawn as lines rather
 * than as points on purpose: a cloud of specks is what this whole layer exists to
 * replace. One flow phase carries every stroke, and the dashes along them read
 * that same phase, so the direction of travel is legible in a still frame.
 *
 * @example
 * const streams = createStreamlines({ look, material, strokes: 18, seeds });
 * streams.setFlow({ phase: 0.4, from: 2.1, to: 0.45, turn: 2.2, alpha: 0.3, ... });
 */

import * as THREE from 'three';
import { inkBlending, inkColor } from '../ink.js';
import { ribbonStrips } from './ribbonStrip.js';
import type { Look, MaterialProfile } from '../../looks/look.js';

/** Samples along one stroke. A bending line needs more than a beam does. */
const SEGMENTS = 40;

/** How far the stroke's alpha feathers in from its edge, per ink treatment. */
const EDGE_SOFTNESS: Record<MaterialProfile['edge'], number> = {
	crisp: 0.35,
	feather: 0.95,
	serrated: 0.55
};

const VERTEX_SHADER = /* glsl */ `
	uniform float uFlow;
	uniform float uFrom;
	uniform float uTo;
	uniform float uOutward;
	uniform float uTurn;
	uniform float uLength;
	uniform float uWidth;
	uniform float uLift;
	uniform float uDrift;
	uniform vec2 uLateral;
	uniform float uWave;
	attribute float aAlong;
	attribute float aSide;
	attribute float aBearing;
	attribute float aPhase;
	attribute float aJitter;
	varying float vLive;
	varying float vS;
	varying float vMouth;
	varying float vSide;
	varying float vT;
	varying float vJitter;

	const float TAU = 6.2831853;

	// Where the stroke is when it is s of the way through its run.
	vec3 streamAt(float s) {
		// Inward matter accelerates into the mouth; pushed matter leaves fast and
		// gives up. One signed kernel, two readable behaviours.
		float e = mix(s * s, 1.0 - (1.0 - s) * (1.0 - s), uOutward);
		float radius = mix(uFrom, uTo, e) + uWave * sin(s * 9.0 + aJitter * TAU + uFlow * TAU);
		float theta = aBearing + uTurn * e;
		return vec3(radius * vec2(cos(theta), sin(theta)) + uDrift * uLateral * e, uLift * e);
	}

	void main() {
		vLive = fract(uFlow + aPhase) - aAlong * uLength;
		float s = clamp(vLive, 0.0, 1.0);
		vec3 here = streamAt(s);
		vec2 tangent = normalize(streamAt(min(s + 0.02, 1.0)).xy - here.xy + vec2(1e-4));
		// A speed stroke: full width at the head, drawn out to nothing behind it.
		vec3 seal = here + vec3(vec2(-tangent.y, tangent.x) * (aSide * uWidth * pow(1.0 - aAlong, 0.45)), 0.0);

		vS = s;
		vMouth = mix(s, 1.0 - s, uOutward);
		vSide = aSide;
		vT = aAlong;
		vJitter = aJitter;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(seal, 1.0);
	}
`;

const FRAGMENT_SHADER = /* glsl */ `
	uniform vec3 uCore;
	uniform vec3 uEdge;
	uniform float uAlpha;
	uniform float uFlash;
	uniform float uFlow;
	uniform float uBands;
	uniform float uEdgeSoft;
	uniform float uNoise;
	uniform float uOutward;
	varying float vLive;
	varying float vS;
	varying float vMouth;
	varying float vSide;
	varying float vT;
	varying float vJitter;

	void main() {
		// Behind the head the stroke has not been drawn yet.
		if (vLive < 0.0) discard;
		// A stroke, not a smear: a lit spine inside a darker body.
		float wide = 1.0 - smoothstep(1.0 - uEdgeSoft, 1.0, abs(vSide));
		float spine = exp(-vSide * vSide * 6.0);
		float across = 0.55 * wide + 0.65 * spine;
		float born = smoothstep(0.0, 0.05, vLive);
		float gone = 1.0 - smoothstep(0.92, 1.0, vS);
		// Dashes travelling by the same phase the stroke travels by.
		float dash = uBands > 0.0 ? 0.62 + 0.38 * sin(vT * uBands * 6.2831853 - uFlow * 6.2831853) : 1.0;
		float grain = 1.0 - uNoise * 0.3 * (0.5 + 0.5 * sin(vT * 37.0 + vJitter * 19.0));
		// The ink darkens as the stroke gathers speed toward the mouth.
		float haste = 0.4 + 0.6 * mix(vS, 1.0 - vS, uOutward);
		// Swallowed, or spat out: one small flash on the head at the mouth itself.
		float mouth = mix(smoothstep(0.7, 0.96, vMouth), 1.0 - smoothstep(0.06, 0.34, vS), uOutward);
		float flash = uFlash * mouth * pow(1.0 - vT, 3.0) * born;

		float alpha = uAlpha * across * born * gone * dash * grain * haste + flash * across;
		if (alpha < 0.003) discard;
		gl_FragColor = vec4(mix(uEdge, uCore, clamp(spine * haste * 0.5 + flash, 0.0, 1.0)), alpha);
		#include <tonemapping_fragment>
		#include <colorspace_fragment>
	}
`;

/** Where the whole field of strokes sits this frame, in seal units and turns. */
export interface Flow {
	/** 0..1, cycling. Every stroke rides it, offset by its own phase. */
	phase: number;
	/** Seal radius a stroke is born at, and the one it is taken at. */
	from: number;
	to: number;
	/** True when `from` is inside `to`: the seal is pushing rather than drawing. */
	outward: boolean;
	/** Signed radians a stroke turns through over its whole run. */
	turn: number;
	/** Seal units the stroke climbs by the time it arrives. */
	lift: number;
	/** Seal units of sideways carry, along `lateral`. */
	drift: number;
	lateral: { x: number; y: number };
	alpha: number;
	/** Brightness of the flash where a stroke meets the mouth. */
	flash: number;
}

export interface Streamlines {
	readonly mesh: THREE.Mesh;
	setFlow(flow: Flow): void;
	dispose(): void;
}

/** One stroke's fixed character: where it starts, when it runs, how it wobbles. */
export interface StrokeSeed {
	bearing: number;
	phase: number;
	jitter: number;
}

/**
 * A field of strokes, one per seed. `length` is how much of a full run a stroke's
 * tail spans, so a persistent material draws long streaks and a brittle one draws
 * short dashes of the same flow.
 */
export function createStreamlines(options: {
	look: Look;
	material: MaterialProfile;
	seeds: readonly StrokeSeed[];
	/** 0..1 of one run. The stroke's own length, not the distance it travels. */
	length: number;
	/** Seal units of half-width at the head. */
	width: number;
}): Streamlines {
	const geometry = ribbonStrips({
		strips: options.seeds.length,
		segments: SEGMENTS,
		constants: {
			aBearing: (stroke) => options.seeds[stroke].bearing,
			aPhase: (stroke) => options.seeds[stroke].phase,
			aJitter: (stroke) => options.seeds[stroke].jitter
		}
	});
	const material = new THREE.ShaderMaterial({
		uniforms: {
			uFlow: { value: 0 },
			uFrom: { value: 0 },
			uTo: { value: 0 },
			uOutward: { value: 0 },
			uTurn: { value: 0 },
			uLength: { value: options.length },
			uWidth: { value: options.width },
			uLift: { value: 0 },
			uDrift: { value: 0 },
			uLateral: { value: new THREE.Vector2() },
			uWave: { value: 0.06 * options.material.undulation },
			uAlpha: { value: 0 },
			uFlash: { value: 0 },
			uBands: { value: options.material.bands },
			uEdgeSoft: { value: EDGE_SOFTNESS[options.material.edge] },
			uNoise: { value: Math.min(1, options.material.noiseScale / 3) },
			uCore: { value: inkColor(options.look.tint.core) },
			uEdge: { value: inkColor(options.look.tint.edge) }
		},
		vertexShader: VERTEX_SHADER,
		fragmentShader: FRAGMENT_SHADER,
		transparent: true,
		depthWrite: false,
		// The seal root's matrix is a reflection, so culling would drop the strokes.
		side: THREE.DoubleSide,
		blending: inkBlending(options.look)
	});

	const mesh = new THREE.Mesh(geometry, material);
	mesh.name = 'intake-streamlines';
	// Every vertex is placed by the shader, so the geometry's bounds are fiction.
	mesh.frustumCulled = false;

	return {
		mesh,
		setFlow(flow) {
			const uniforms = material.uniforms;
			uniforms.uFlow.value = flow.phase;
			uniforms.uFrom.value = flow.from;
			uniforms.uTo.value = flow.to;
			uniforms.uOutward.value = flow.outward ? 1 : 0;
			uniforms.uTurn.value = flow.turn;
			uniforms.uLift.value = flow.lift;
			uniforms.uDrift.value = flow.drift;
			(uniforms.uLateral.value as THREE.Vector2).set(flow.lateral.x, flow.lateral.y);
			uniforms.uAlpha.value = flow.alpha;
			uniforms.uFlash.value = flow.flash;
			mesh.visible = flow.alpha > 0 || flow.flash > 0;
		},
		dispose() {
			geometry.dispose();
			material.dispose();
		}
	};
}
