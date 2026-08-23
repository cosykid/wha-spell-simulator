/**
 * @file The shading a flowing ink surface shares: how its edge is drawn, how its
 * banding travels, and how it jitters.
 *
 * The beam's ribbons and the fan's sheet are the same kind of surface seen twice
 * — ink carried along a flow — so the three functions that make one legible live
 * here rather than once in each shader. Everything is a pure GLSL function of a
 * material number and a phase, so the caller keeps the say over both.
 *
 * `bands`, `edge`, `flicker` and `noiseScale` are look-table numbers
 * (`looks/look.ts`); this module only reads them.
 *
 * @example
 * const fragment = `${FLOW_INK_GLSL} void main() { ... inkEdge(vSide, uEdgeMode, 0.0) ... }`;
 */

import type { MaterialProfile } from '../../looks/look.js';

/** How deep a banded row's stripes cut. A row with no bands is unbanded, not faint. */
const BAND_DEPTH = 0.62;

/** The GLSL a flowing surface's fragment shader includes. */
export const FLOW_INK_GLSL = /* glsl */ `
	// Ink across a strip. \`side\` runs -1..1 across it, \`mode\` is 0 crisp, 1
	// feather, 2 serrated, and \`along\` moves the serration's teeth down the strip.
	float inkEdge(float side, float mode, float along) {
		float s = abs(side);
		if (mode < 0.5) {
			return 1.0 - smoothstep(0.84, 1.0, s);
		}
		if (mode < 1.5) {
			return (1.0 - s * s) * (1.0 - 0.35 * s);
		}
		float tooth = 0.58 + 0.42 * abs(fract(along) * 2.0 - 1.0);
		return 1.0 - smoothstep(tooth - 0.14, tooth, s);
	}

	// One band of a travelling pattern. \`count\` bands span \`along\`, moved by the
	// same phase the geometry advances by, which is what makes flow read in a
	// still frame. \`depth\` is zero on an unbanded row.
	float flowBand(float along, float count, float phase, float depth) {
		float wave = 0.5 + 0.5 * cos((along * count - phase) * 6.2831853);
		return 1.0 - depth + depth * wave;
	}

	float inkHash(float x) {
		return fract(sin(x * 127.1) * 43758.5453123);
	}

	// High-frequency amplitude jitter, stepped so it strobes rather than drifts.
	// Driven by the flow phase, so a replay at the same phase jitters the same.
	float inkFlicker(float seed, float phase, float amount) {
		float ticks = phase * 5.0;
		float from = inkHash(seed + floor(ticks));
		float to = inkHash(seed + floor(ticks) + 1.0);
		return 1.0 + amount * (mix(from, to, fract(ticks)) - 0.5);
	}
`;

/** The look's edge treatment as the number {@link FLOW_INK_GLSL}'s `inkEdge` switches on. */
export function edgeMode(material: MaterialProfile): number {
	return material.edge === 'crisp' ? 0 : material.edge === 'feather' ? 1 : 2;
}

/** How deep this row's flow banding cuts. Zero where the row carries no bands. */
export function bandDepth(material: MaterialProfile): number {
	return material.bands > 0 ? BAND_DEPTH : 0;
}
