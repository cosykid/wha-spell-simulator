/**
 * @file Wind's look row. Air has no body of its own, so what the viewer reads is
 * the path rather than the parcel: the tints are the faintest in the table and
 * every role but `skin` is additive light. `skin` keeps a surface, because wind
 * manipulates something visible even when it manifests nothing itself (R-11).
 *
 * The dictionary is explicit that the sigil "moves and manipulates air" and does
 * not create any, so the row is a path taken rather than a thing made. The motes
 * it carries are the only witnesses that anything moved, so the garnish budget
 * stays generous. There is no mass to accelerate, so only the two light sources
 * weigh less, and gusts arrive the instant the drive does.
 */

import type { LookRow } from './look.js';

const AIR = [224, 248, 231] as const;
const HAZE = [184, 232, 215] as const;
const DUST = [140, 186, 178] as const;

export const WIND_LOOKS: LookRow = {
	material: {
		emissive: 0.18,
		bands: 5,
		garnishDensity: 0.6,
		flicker: 0.3,
		undulation: 0.55,
		weight: 0.18
	},
	core: {
		tint: { core: [222, 252, 240], edge: AIR },
		blend: 'lighter'
	},
	body: {
		tint: { core: AIR, edge: HAZE },
		blend: 'lighter'
	},
	wisp: {
		tint: { core: HAZE, edge: DUST },
		blend: 'lighter'
	},
	ember: {
		tint: { core: AIR, edge: HAZE },
		blend: 'lighter'
	},
	skin: {
		tint: { core: HAZE, edge: DUST },
		blend: 'source-over'
	}
};
