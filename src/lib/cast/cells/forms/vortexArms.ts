/**
 * @file The funnel's arms: helical ink ribbons wound on a flaring core, and the
 * one place the vortex's silhouette is decided.
 *
 * An arm is a stripe painted on the cone, not a tube floating beside it, so the
 * strip hugs the funnel and the eye it winds around stays a hole. The vertex
 * shader builds every arm from three attributes (how far up, which side of the
 * ribbon, which arm), so the funnel grows, flares, leans and turns without a
 * geometry rebuild.
 *
 * Two rules from the abandoned `tc-field-canvas-rework` branch survive in full:
 * the core **flares with height** and the crown **folds out and down**, closing
 * the circulation cell rather than ending in a machined rim; and the band shading
 * reads the **same phase the geometry turns by**, or a rotating volume goes to
 * mush.
 *
 * @example
 * const arms = createVortexArms({ look, material, arms: 5, seeds });
 * arms.setFunnel({ phase: 1.2, foot: 0.28, crown: 0.7, height: 1.5, ... });
 */

import * as THREE from 'three';
import { inkBlending, inkColor } from '../ink.js';
import { ribbonStrips } from './ribbonStrip.js';
import type { Look, MaterialProfile } from '../../looks/look.js';

/** Samples up one arm. Enough that a wound ribbon reads as a curve, not a fan. */
const SEGMENTS = 84;

/** Radians of spin the afterimage lags the ink by, and how much wider it runs. */
const GHOST = { lag: 0.34, widen: 1.5, alpha: 0.3 } as const;

/** How far the ribbon's alpha feathers in from its edge, per ink treatment. */
const EDGE_SOFTNESS: Record<MaterialProfile['edge'], number> = {
	crisp: 0.3,
	feather: 0.92,
	serrated: 0.48
};

/** How deeply the ribbon's edge is bitten into teeth, per ink treatment. */
const EDGE_SERRATION: Record<MaterialProfile['edge'], number> = {
	crisp: 0,
	feather: 0,
	serrated: 0.6
};

const VERTEX_SHADER = /* glsl */ `
	uniform float uArms;
	uniform float uPhase;
	uniform float uPitch;
	uniform float uFoot;
	uniform float uCrown;
	uniform float uHeight;
	uniform float uWidth;
	uniform float uSway;
	uniform float uSwayPhase;
	uniform float uFlicker;
	attribute float aAlong;
	attribute float aSide;
	attribute float aArm;
	attribute float aSeed;
	varying float vRise;
	varying float vSide;
	varying float vArm;
	varying float vSeed;
	varying float vNear;

	const float TAU = 6.2831853;

	void main() {
		// The ribbon is a stripe on the wall, so its width is seal units of wall
		// read back as a share of the climb the arm makes.
		float halfWidth = 0.5 * uWidth / max(uHeight, 0.2);
		float t = clamp(aAlong + aSide * halfWidth, 0.0, 1.06);
		float climb = smoothstep(0.0, 0.92, t);
		// Past the crown the arm turns out and down. That fold is the branch's
		// spill, and it is what makes the funnel a closed cell instead of a cone.
		float fold = smoothstep(0.82, 1.06, t);
		// A late flare, not a straight cone: the funnel holds its foot for the lower
		// half and opens near the crown, which is the profile a whirl reads by.
		float radius = mix(uFoot, uCrown, pow(climb, 1.35)) * (1.0 + 0.5 * fold);
		radius *= 1.0 + uFlicker * 0.09 * sin(t * 19.0 + aSeed * TAU + uPhase * 2.0);

		float theta = uPhase + aArm * TAU / uArms + t * uPitch;
		// A lashing centerline. Two incommensurate leans, growing with height, so
		// the funnel breathes instead of standing like a lathe-turned cone.
		vec2 axis = vec2(
			sin(uSwayPhase + climb * 2.1),
			sin(uSwayPhase * 0.7 + climb * 1.7 + 1.9)
		) * (uSway * pow(climb, 1.3));

		vec3 seal = vec3(
			axis + radius * vec2(cos(theta), sin(theta)),
			uHeight * (climb - 0.16 * fold)
		);
		vRise = t;
		vSide = aSide;
		vArm = aArm;
		vSeed = aSeed;
		// Seal y grows toward the viewer, so this is which face of the funnel the
		// vertex is on. Dimming the far one is what keeps the eye a hole.
		vNear = sin(theta);
		gl_Position = projectionMatrix * modelViewMatrix * vec4(seal, 1.0);
	}
`;

const FRAGMENT_SHADER = /* glsl */ `
	uniform vec3 uCore;
	uniform vec3 uEdge;
	uniform float uAlpha;
	uniform float uArms;
	uniform float uLit;
	uniform float uPhase;
	uniform float uBands;
	uniform float uEdgeSoft;
	uniform float uSerrate;
	uniform float uNoise;
	uniform float uEmissive;
	uniform float uShred;
	varying float vRise;
	varying float vSide;
	varying float vArm;
	varying float vSeed;
	varying float vNear;

	void main() {
		float bite = uSerrate * (0.5 + 0.5 * sin(vRise * 47.0 + vSeed * 31.0));
		float across = abs(vSide) * (1.0 + bite);
		float body = 1.0 - smoothstep(1.0 - uEdgeSoft, 1.0, across);
		// Rooted in the floor, shredded at the crown, so the tip dissolves into
		// flecks instead of ending in a machined rim. A garnish-heavy material
		// starts shredding further down.
		float ends = smoothstep(0.015, 0.1, vRise) * (1.0 - smoothstep(uShred, 1.06, vRise));
		// The stripes crawl by the same phase the arm turns by. Any other phase
		// here and the rotation stops reading in a still frame.
		float band = uBands > 0.0 ? 0.66 + 0.34 * sin(vRise * uBands * 6.2831853 - uPhase) : 1.0;
		float grain = 1.0 - uNoise * 0.3 * (0.5 + 0.5 * sin(vRise * 61.0 + vSeed * 17.0 - uPhase * 2.0));
		// The far wall of the funnel is drawn faint, so the eye between the arms
		// stays a hole rather than filling with the ink of the back side.
		float facing = 0.32 + 0.68 * (0.5 + 0.5 * vNear);
		// Emission lights the arms one at a time: a thin swirl turns on two
		// ribbons and a full one turns on every ribbon it has.
		float lit = clamp(uLit * uArms - vArm, 0.0, 1.0);

		// An inked ribbon is an outline with a lit spine down it, not a wash. The
		// dark rim is what keeps the funnel legible against the cream paper, where
		// a purely additive form disappears.
		float spine = exp(-across * across * 5.0);
		float rim = smoothstep(0.3, 0.8, across) * (1.0 - smoothstep(0.85, 1.05, across));
		float stroke = 0.3 * body + 0.75 * spine + 0.85 * rim;

		float alpha = uAlpha * lit * stroke * ends * band * grain * facing;
		if (alpha < 0.003) discard;
		// Only a material that makes its own light burns its spine out to the core
		// tint; a heavy one keeps the whole ribbon its own darker color.
		gl_FragColor = vec4(mix(uEdge, uCore, spine * band * (0.35 + 0.65 * uEmissive)), alpha);
		#include <tonemapping_fragment>
		#include <colorspace_fragment>
	}
`;

/** Where the funnel stands this frame, in seal units and radians. */
export interface Funnel {
	/** Radians of spin. Advanced by the caller; the bands read it too. */
	phase: number;
	/** Core radius at the foot, and at the crown it flares to. */
	foot: number;
	crown: number;
	/** Seal units the crown stands at. */
	height: number;
	/** Radians of winding per unit of rise. Signed, so the arms wind the way they turn. */
	pitch: number;
	/** Seal units the centerline leans by at the crown, and that lean's own cycle. */
	sway: number;
	swayPhase: number;
	alpha: number;
	/** Fraction of the arms that are lit, 0..1. */
	lit: number;
}

export interface VortexArms {
	readonly object: THREE.Group;
	setFunnel(funnel: Funnel): void;
	dispose(): void;
}

function armsMaterial(options: {
	look: Look;
	material: MaterialProfile;
	arms: number;
	width: number;
}): THREE.ShaderMaterial {
	return new THREE.ShaderMaterial({
		uniforms: {
			uArms: { value: options.arms },
			uPhase: { value: 0 },
			uPitch: { value: 0 },
			uFoot: { value: 0 },
			uCrown: { value: 0 },
			uHeight: { value: 0 },
			uWidth: { value: options.width },
			uSway: { value: 0 },
			uSwayPhase: { value: 0 },
			uFlicker: { value: options.material.flicker },
			uAlpha: { value: 0 },
			uLit: { value: 0 },
			uBands: { value: options.material.bands },
			uEdgeSoft: { value: EDGE_SOFTNESS[options.material.edge] },
			uSerrate: { value: EDGE_SERRATION[options.material.edge] },
			uNoise: { value: Math.min(1, options.material.noiseScale / 3) },
			uEmissive: { value: options.material.emissive },
			uShred: { value: 0.94 - 0.16 * options.material.garnishDensity },
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
}

/**
 * One funnel's worth of arms, built from a look, an arm count and one seed per
 * arm. The ink is drawn twice: a wider, fainter copy lagging behind in spin is
 * the material profile's `trailPersistence`, and it is what makes a fast whirl
 * smear rather than strobe.
 */
export function createVortexArms(options: {
	look: Look;
	material: MaterialProfile;
	arms: number;
	seeds: readonly number[];
}): VortexArms {
	// Seal units of wall the ribbon covers. Narrow: wide arms overlap into a
	// knot, and a knot is the one thing a funnel must never read as.
	const width = Math.max(0.05, Math.min(0.2, options.material.ribbonWidth * 0.75));
	const geometry = ribbonStrips({
		strips: options.arms,
		segments: SEGMENTS,
		constants: { aArm: (arm) => arm, aSeed: (arm) => options.seeds[arm] ?? 0 }
	});
	const ink = armsMaterial({ ...options, width });
	const ghost = armsMaterial({ ...options, width: width * GHOST.widen });
	const trail = options.material.trailPersistence;

	const object = new THREE.Group();
	object.name = 'vortex-arms';
	for (const [name, material] of [
		['vortex-arms-ghost', ghost],
		['vortex-arms-ink', ink]
	] as const) {
		const mesh = new THREE.Mesh(geometry, material);
		mesh.name = name;
		// The shader places every vertex, so the geometry's bounds are fiction.
		mesh.frustumCulled = false;
		object.add(mesh);
	}

	return {
		object,
		setFunnel(funnel) {
			for (const material of [ink, ghost]) {
				const lag = material === ghost ? GHOST.lag : 0;
				material.uniforms.uPhase.value = funnel.phase - lag;
				material.uniforms.uPitch.value = funnel.pitch;
				material.uniforms.uFoot.value = funnel.foot;
				material.uniforms.uCrown.value = funnel.crown;
				material.uniforms.uHeight.value = funnel.height;
				material.uniforms.uSway.value = funnel.sway;
				material.uniforms.uSwayPhase.value = funnel.swayPhase;
				material.uniforms.uLit.value = funnel.lit;
			}
			ink.uniforms.uAlpha.value = funnel.alpha;
			ghost.uniforms.uAlpha.value = funnel.alpha * trail * GHOST.alpha;
			object.visible = funnel.alpha > 0;
		},
		dispose() {
			object.clear();
			geometry.dispose();
			ink.dispose();
			ghost.dispose();
		}
	};
}
