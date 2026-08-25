/**
 * @file Earth's look row. Earth is the one element that is not light: `body`,
 * `skin` and `wisp` composite `source-over` so a grain occludes the grain behind
 * it instead of glowing through it, and only the strike keeps an additive core.
 * Trails are short, because a clod does not smear.
 *
 * The dictionary calls it the sigil of might and has it "manipulate solid
 * materials such as stone, sand, soil, and wood", so the material is the one
 * that is matter first and light barely at all. Its fill is the table's only
 * fully opaque one and its emission the lowest of the five elements, which is
 * the same claim the `source-over` roles make, said in the cell stage's terms.
 * Weight is the table's maximum, so an earth form heaves into place and thuds
 * rather than drifting, its edge is serrated because a broken slab has a chipped
 * silhouette, it throws the second heaviest garnish in chunks rather than
 * sparks, and it is unbanded, because nothing here is flowing.
 */

import type { LookRow } from './look.js';

const GRIT = [214, 189, 148] as const;
const LOAM = [111, 83, 45] as const;
const SHALE = [66, 50, 32] as const;

export const EARTH_LOOKS: LookRow = {
	material: {
		emissive: 0.08,
		opacity: 1,
		edge: 'serrated',
		bands: 0,
		noiseScale: 1.4,
		ribbonWidth: 0.3,
		garnishDensity: 0.72,
		trailPersistence: 0.12,
		flicker: 0.04,
		undulation: 0.06,
		weight: 1
	},
	core: {
		sprite: 'spark',
		tint: { core: [255, 210, 138], edge: GRIT },
		sizePx: [4, 14],
		trail: { frames: 2, widthScale: 0.55 },
		blend: 'lighter',
		stretch: 0.5,
		fade: 'decay'
	},
	body: {
		sprite: 'disc',
		tint: { core: GRIT, edge: LOAM },
		sizePx: [6, 13],
		trail: null,
		blend: 'source-over',
		stretch: 0.35,
		fade: 'decay'
	},
	wisp: {
		sprite: 'disc',
		tint: { core: LOAM, edge: SHALE },
		sizePx: [4, 10],
		trail: { frames: 2, widthScale: 0.45 },
		blend: 'source-over',
		stretch: 0.4,
		fade: 'leak'
	},
	ember: {
		sprite: 'streak',
		tint: { core: GRIT, edge: LOAM },
		sizePx: [2, 5],
		trail: { frames: 3, widthScale: 0.4 },
		blend: 'lighter',
		stretch: 1.6,
		fade: 'decay'
	},
	skin: {
		sprite: 'disc',
		tint: { core: GRIT, edge: SHALE },
		sizePx: [8, 14],
		trail: null,
		blend: 'source-over',
		stretch: 0.15,
		fade: 'leak'
	}
};
