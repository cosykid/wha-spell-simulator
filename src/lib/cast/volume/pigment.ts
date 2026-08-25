/**
 * @file How the eight rows are PAINTED: a pigment ramp, a rim ink, the ink-skin
 * shader row, and the ground wash row per element. `elements.ts` owns how a row
 * moves; this file owns nothing but color and wash weights, which is the same
 * split the look table draws.
 *
 * Fire's stops are the approved prototype's ramp digit for digit; water and
 * wind are the prototype's rows, themselves derived from the shipped look rows.
 * The other five are derived here from their look rows' own tints (`looks/*.ts`,
 * read-only), pulled darker at the low end so the rim can be ink: a watercolor
 * body needs a value range the role tints alone do not span.
 */

import type { VolumeElement } from './elements.js';

/** One stop on a pigment ramp: position on the heat axis, display sRGB 0..1. */
interface Stop {
	at: number;
	rgb: readonly [number, number, number];
}

/**
 * The heat axis differs per element: fire runs cold soot to warm near-white
 * core, water runs deep indigo to pale foam, earth runs shale shadow to sunlit
 * grit, crystal runs violet seam to ice facet.
 */
const RAMPS: Record<VolumeElement, readonly Stop[]> = {
	fire: [
		{ at: 0.0, rgb: [0.129, 0.09, 0.063] },
		{ at: 0.14, rgb: [0.256, 0.126, 0.076] },
		{ at: 0.27, rgb: [0.44, 0.156, 0.088] },
		{ at: 0.4, rgb: [0.735, 0.184, 0.082] },
		{ at: 0.53, rgb: [0.878, 0.34, 0.096] },
		{ at: 0.67, rgb: [0.957, 0.485, 0.13] },
		{ at: 0.82, rgb: [1.0, 0.673, 0.196] },
		{ at: 0.93, rgb: [1.0, 0.827, 0.44] },
		{ at: 1.0, rgb: [1.0, 0.941, 0.804] }
	],
	water: [
		{ at: 0.0, rgb: [0.031, 0.11, 0.24] },
		{ at: 0.18, rgb: [0.039, 0.243, 0.478] },
		{ at: 0.38, rgb: [0.071, 0.478, 0.855] },
		{ at: 0.58, rgb: [0.243, 0.62, 0.878] },
		{ at: 0.78, rgb: [0.502, 0.855, 1.0] },
		{ at: 0.92, rgb: [0.749, 0.937, 1.0] },
		{ at: 1.0, rgb: [0.902, 0.973, 1.0] }
	],
	wind: [
		{ at: 0.0, rgb: [0.42, 0.565, 0.53] },
		{ at: 0.3, rgb: [0.549, 0.729, 0.698] },
		{ at: 0.6, rgb: [0.722, 0.91, 0.843] },
		{ at: 0.85, rgb: [0.878, 0.973, 0.906] },
		{ at: 1.0, rgb: [0.945, 0.988, 0.953] }
	],
	// looks/earth.ts SHALE -> LOAM -> GRIT, with a sunlit sand top: matte ochre
	// and umber, heavy value range so the mound reads carved rather than flat.
	earth: [
		{ at: 0.0, rgb: [0.2, 0.152, 0.098] },
		{ at: 0.22, rgb: [0.322, 0.235, 0.137] },
		{ at: 0.48, rgb: [0.435, 0.325, 0.176] },
		{ at: 0.74, rgb: [0.65, 0.55, 0.396] },
		{ at: 0.92, rgb: [0.839, 0.741, 0.58] },
		{ at: 1.0, rgb: [0.925, 0.855, 0.702] }
	],
	// looks/light.ts GOLD -> GLOW -> FLARE over a deep amber base. The low end
	// is the one invention: pale gold on cream needs a value anchor, and the
	// dictionary's row has none because light was drawn additive.
	light: [
		{ at: 0.0, rgb: [0.55, 0.42, 0.19] },
		{ at: 0.25, rgb: [0.76, 0.6, 0.28] },
		{ at: 0.52, rgb: [0.957, 0.84, 0.463] },
		{ at: 0.78, rgb: [1.0, 0.949, 0.706] },
		{ at: 0.93, rgb: [1.0, 0.968, 0.8] },
		{ at: 1.0, rgb: [1.0, 0.98, 0.86] }
	],
	// looks/crystal.ts SEAM -> QUARTZ -> FACET, the seam pulled toward violet
	// so the stone reads gem rather than sea: cool, hard, wide value range.
	crystal: [
		{ at: 0.0, rgb: [0.17, 0.16, 0.36] },
		{ at: 0.24, rgb: [0.24, 0.29, 0.52] },
		{ at: 0.5, rgb: [0.443, 0.58, 0.78] },
		{ at: 0.74, rgb: [0.66, 0.8, 0.91] },
		{ at: 0.9, rgb: [0.85, 0.93, 0.99] },
		{ at: 1.0, rgb: [0.945, 0.98, 1.0] }
	],
	// looks/aeroform.ts MIST -> BLOOM -> VEIL: wind's cousin with the contrast
	// halved again, barely off the paper.
	aeroform: [
		{ at: 0.0, rgb: [0.53, 0.63, 0.67] },
		{ at: 0.35, rgb: [0.611, 0.729, 0.78] },
		{ at: 0.68, rgb: [0.729, 0.847, 0.878] },
		{ at: 1.0, rgb: [0.9, 0.95, 0.945] }
	],
	// looks/inert.ts VOID_INK -> SLATE -> ASH: gray-brown, low energy, the
	// designed default and deliberately the least chromatic row (R-11).
	inert: [
		{ at: 0.0, rgb: [0.2, 0.208, 0.216] },
		{ at: 0.3, rgb: [0.36, 0.365, 0.36] },
		{ at: 0.62, rgb: [0.494, 0.51, 0.518] },
		{ at: 0.88, rgb: [0.72, 0.72, 0.69] },
		{ at: 1.0, rgb: [0.84, 0.84, 0.81] }
	]
};

/** The ink each element's rim line is drawn in, dark against its own washes. */
export const INKS: Record<VolumeElement, readonly [number, number, number]> = {
	fire: [0.16, 0.085, 0.05],
	water: [0.05, 0.13, 0.27],
	wind: [0.33, 0.44, 0.41],
	earth: [0.17, 0.125, 0.075],
	light: [0.42, 0.31, 0.13],
	crystal: [0.14, 0.13, 0.3],
	aeroform: [0.42, 0.51, 0.52],
	inert: [0.18, 0.19, 0.2]
};

function clamp01(v: number): number {
	return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(a: number, b: number, v: number): number {
	const t = clamp01((v - a) / (b - a));
	return t * t * (3 - 2 * t);
}

/** Samples an element's ramp in JS. Same fold of smoothsteps as the GLSL. */
export function rampJs(
	element: VolumeElement,
	heat: number,
	out: { r: number; g: number; b: number }
): void {
	const ramp = RAMPS[element];
	const h = clamp01(heat);
	out.r = ramp[0].rgb[0];
	out.g = ramp[0].rgb[1];
	out.b = ramp[0].rgb[2];
	for (let i = 1; i < ramp.length; i += 1) {
		const t = smoothstep(ramp[i - 1].at, ramp[i].at, h);
		out.r += (ramp[i].rgb[0] - out.r) * t;
		out.g += (ramp[i].rgb[1] - out.g) * t;
		out.b += (ramp[i].rgb[2] - out.b) * t;
	}
}

/** The same ramp emitted as a GLSL function `vec3 pigment(float h)`. */
export function rampGlsl(element: VolumeElement): string {
	const ramp = RAMPS[element];
	const v = (rgb: readonly [number, number, number]) =>
		`vec3(${rgb.map((c) => c.toFixed(4)).join(', ')})`;
	const lines = ramp
		.slice(1)
		.map(
			(stop, i) =>
				`\tc = mix(c, ${v(stop.rgb)}, smoothstep(${ramp[i].at.toFixed(3)}, ${stop.at.toFixed(3)}, h));`
		);
	return [
		'vec3 pigment(float heat) {',
		'\tfloat h = clamp(heat, 0.0, 1.0);',
		`\tvec3 c = ${v(ramp[0].rgb)};`,
		...lines,
		'\treturn c;',
		'}'
	].join('\n');
}

/**
 * The ink-skin shader row: flat height-stepped washes, a dark fresnel rim,
 * granulation, and water's one concession to shine. `heatBase`/`heatSpan` aim
 * the ramp along seal height: fire is hot at the base and spent at the crown,
 * water is deep in the body and foam at the crest.
 */
export interface InkStyleRow {
	opacity: number;
	bands: number;
	rim: number;
	glint: number;
	heatBase: number;
	heatSpan: number;
	/** How fast the wash borders wobble. Fire flickers; crystal holds still. */
	wobbleRate: number;
	/** Flat-shaded facet normals. Crystal's alone: angular there is a choice. */
	facet: 0 | 1;
}

export const INK_STYLE: Record<VolumeElement, InkStyleRow> = {
	fire: {
		opacity: 0.94,
		bands: 4,
		rim: 0.6,
		glint: 0,
		heatBase: 0.8,
		heatSpan: -0.55,
		wobbleRate: 1.6,
		facet: 0
	},
	water: {
		opacity: 0.88,
		bands: 3,
		rim: 0.9,
		glint: 0.35,
		heatBase: 0.3,
		heatSpan: 0.55,
		wobbleRate: 1,
		facet: 0
	},
	wind: {
		opacity: 0.28,
		bands: 3,
		rim: 0.4,
		glint: 0,
		heatBase: 0.5,
		heatSpan: 0.3,
		wobbleRate: 1.2,
		facet: 0
	},
	earth: {
		opacity: 1.0,
		bands: 5,
		rim: 0.75,
		glint: 0,
		heatBase: 0.35,
		heatSpan: 0.45,
		wobbleRate: 0.25,
		facet: 0
	},
	light: {
		opacity: 0.52,
		bands: 3,
		rim: 0.5,
		glint: 0,
		heatBase: 0.45,
		heatSpan: 0.38,
		wobbleRate: 0.7,
		facet: 0
	},
	crystal: {
		opacity: 0.9,
		bands: 5,
		rim: 0.85,
		glint: 0,
		heatBase: 0.35,
		heatSpan: 0.55,
		wobbleRate: 0.12,
		facet: 1
	},
	aeroform: {
		opacity: 0.2,
		bands: 2,
		rim: 0.25,
		glint: 0,
		heatBase: 0.55,
		heatSpan: 0.25,
		wobbleRate: 0.8,
		facet: 0
	},
	inert: {
		opacity: 0.5,
		bands: 3,
		rim: 0.5,
		glint: 0,
		heatBase: 0.4,
		heatSpan: 0.3,
		wobbleRate: 0.6,
		facet: 0
	}
};

/** The paper-contact wash under a cast: tint, weight, and how it grows. */
export interface WashRow {
	color: readonly [number, number, number];
	strength: number;
	baseRadius: number;
	/** Seal units of radius the wash gains at a full gauge. */
	grow: number;
}

export const WASH: Record<VolumeElement, WashRow> = {
	// Soot under the flame, a puddle that grows with actually-pooled mass, a
	// breath of dust under wind, a dust skirt under the mound, and a warm
	// brightening under light: paper contact is per-element on purpose.
	fire: { color: [0.3, 0.17, 0.1], strength: 0.3, baseRadius: 0.95, grow: 0.25 },
	water: { color: [0.14, 0.34, 0.55], strength: 0.5, baseRadius: 0.55, grow: 1.15 },
	wind: { color: [0.52, 0.6, 0.57], strength: 0.09, baseRadius: 1.1, grow: 0.3 },
	earth: { color: [0.33, 0.26, 0.17], strength: 0.42, baseRadius: 0.65, grow: 0.75 },
	light: { color: [0.99, 0.94, 0.78], strength: 0.16, baseRadius: 1.0, grow: 0.2 },
	crystal: { color: [0.2, 0.22, 0.4], strength: 0.2, baseRadius: 0.6, grow: 0.3 },
	aeroform: { color: [0.6, 0.68, 0.66], strength: 0.06, baseRadius: 1.2, grow: 0.2 },
	inert: { color: [0.33, 0.33, 0.31], strength: 0.12, baseRadius: 0.8, grow: 0.2 }
};

/**
 * The charge-beat ambient's own tint: the medium is the seal's element seen
 * faint, so it samples the row's ramp low and lifts a touch toward the paper.
 */
export function ambientTint(element: VolumeElement): { r: number; g: number; b: number } {
	const out = { r: 0, g: 0, b: 0 };
	rampJs(element, 0.42, out);
	out.r = out.r * 0.82 + 0.12;
	out.g = out.g * 0.82 + 0.12;
	out.b = out.b * 0.82 + 0.12;
	return out;
}
