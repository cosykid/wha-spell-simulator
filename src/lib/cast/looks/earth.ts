/**
 * @file Earth's look row. Earth is the one element that is not light: `body`,
 * `skin` and `wisp` composite `source-over` so a grain occludes the grain behind
 * it instead of glowing through it, and only the strike keeps an additive core.
 *
 * The dictionary calls it the sigil of might and has it "manipulate solid
 * materials such as stone, sand, soil, and wood", so the material is the one
 * that is matter first and light barely at all. Its fill is the table's only
 * fully opaque one and its emission the lowest of the five elements, which is
 * the same claim the `source-over` roles make, said in the cell stage's terms.
 * Weight is the table's maximum, so an earth form heaves into place and thuds
 * rather than drifting, its edge is serrated because a broken slab has a chipped
 * silhouette, it throws the second heaviest garnish in chunks rather than
 * sparks, and it is unbanded, because nothing here is flowing. Its afterimage is
 * short, because a clod does not smear.
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
		tint: { core: [255, 210, 138], edge: GRIT },
		blend: 'lighter'
	},
	body: {
		tint: { core: GRIT, edge: LOAM },
		blend: 'source-over'
	},
	wisp: {
		tint: { core: LOAM, edge: SHALE },
		blend: 'source-over'
	},
	ember: {
		tint: { core: GRIT, edge: LOAM },
		blend: 'lighter'
	},
	skin: {
		tint: { core: GRIT, edge: SHALE },
		blend: 'source-over'
	}
};
