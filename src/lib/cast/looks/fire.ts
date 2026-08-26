/**
 * @file Fire's look row. Fire is a light source, so every role but `skin` is
 * additive: a flame is seen through and never in front of.
 *
 * The tints are carried over from the field renderer's palette so the phase 5
 * cutover changes a spell's motion without changing its color.
 *
 * The dictionary gives fire two products at once, "flame and heat depending on
 * the signs paired with it", and only one of them is a shape. So the material
 * paints the flame and lets the heat go: full emission, the thinnest fill of any
 * lit row, a feathered edge because a flame has no surface to draw, and almost
 * no weight because nothing that rises has any. Flicker is the table's maximum
 * and the only motion texture a viewer will name it by, so no other row is
 * allowed near it. It is the row that breaks up the finest and the row with no
 * bands at all: the sigil converges potential to a point rather than channeling
 * a flow, and a striped flame reads as cloth. Its afterimage outlasts every row
 * that is matter, because a flame reads as motion smeared over the frame it was
 * in.
 */

import type { LookRow } from './look.js';

const HOT = [255, 242, 160] as const;
const FLAME = [243, 116, 43] as const;
const SMOKE = [120, 62, 38] as const;

export const FIRE_LOOKS: LookRow = {
	material: {
		emissive: 1,
		opacity: 0.28,
		edge: 'feather',
		bands: 0,
		noiseScale: 3.4,
		ribbonWidth: 0.16,
		garnishDensity: 0.9,
		trailPersistence: 0.55,
		flicker: 0.95,
		undulation: 0.4,
		weight: 0.12
	},
	core: {
		tint: { core: [255, 238, 186], edge: HOT },
		blend: 'lighter'
	},
	body: {
		tint: { core: HOT, edge: FLAME },
		blend: 'lighter'
	},
	wisp: {
		tint: { core: FLAME, edge: SMOKE },
		blend: 'lighter'
	},
	ember: {
		tint: { core: [255, 232, 150], edge: FLAME },
		blend: 'lighter'
	},
	skin: {
		tint: { core: FLAME, edge: SMOKE },
		blend: 'source-over'
	}
};
