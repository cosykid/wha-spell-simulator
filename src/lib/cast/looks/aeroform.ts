/**
 * @file Aeroform's look row. Aeroform's element is wind, and the dictionary
 * draws the line this row paints: "Aeroform ... creates and manipulates air, but
 * does not itself move that air. It complements the wind sigil, which moves air
 * without creating it."
 *
 * Wind is a path and aeroform is a volume, and what carries that difference in
 * the tints is contrast. This row is paler and greyer than wind's, it never goes
 * as deep, and its core-to-edge fall is the shallowest in the table, because a
 * shallow fall is what makes a mass read as soft rather than as a lit edge.
 *
 * The material reads the same sentence as a volume. Aeroform carries the widest
 * ribbon in the table against wind's narrowest, several times wind's fill, and
 * more weight, because air that was made has some body to it. Everything that
 * makes wind read as a path comes back down: a fraction of wind's flicker, a
 * fraction of its break-up, and a shorter afterimage, since a veil hangs where a
 * gust streaks. What survives is the swell, so undulation runs above wind's:
 * the only motion left in air that was made and not moved is a slow one.
 */

import type { LookRow } from './look.js';

/** The air it makes. Paler and greyer than wind's `AIR`, so the row reads as substance. */
const VEIL = [214, 236, 236] as const;
/** One step down, barely: low core-to-edge contrast is what makes a volume soft. */
const BLOOM = [186, 216, 224] as const;
/** The deepest this row goes, still well short of wind's `DUST`. */
const MIST = [156, 186, 198] as const;

export const AEROFORM_LOOKS: LookRow = {
	material: {
		emissive: 0.22,
		opacity: 0.35,
		edge: 'feather',
		bands: 2,
		noiseScale: 0.6,
		ribbonWidth: 0.42,
		garnishDensity: 0.18,
		trailPersistence: 0.5,
		flicker: 0.05,
		undulation: 0.62,
		weight: 0.32
	},
	core: {
		tint: { core: [236, 250, 250], edge: VEIL },
		blend: 'lighter'
	},
	body: {
		tint: { core: VEIL, edge: BLOOM },
		blend: 'lighter'
	},
	wisp: {
		tint: { core: BLOOM, edge: MIST },
		blend: 'lighter'
	},
	ember: {
		tint: { core: VEIL, edge: BLOOM },
		blend: 'lighter'
	},
	skin: {
		tint: { core: BLOOM, edge: MIST },
		blend: 'source-over'
	}
};
