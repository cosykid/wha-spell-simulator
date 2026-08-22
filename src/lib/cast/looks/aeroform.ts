/**
 * @file Aeroform's look row. Aeroform's element is wind, and the dictionary
 * draws the line this row paints: "Aeroform ... creates and manipulates air, but
 * does not itself move that air. It complements the wind sigil, which moves air
 * without creating it."
 *
 * Wind is a path, so its row is thin, hard and heavily streaked. Aeroform is a
 * volume, so this row is the opposite reading of the same element: soft discs
 * where wind runs streaks, the largest sizes of the two rows in every role, a
 * fraction of wind's stretch, and few wide ghosts that veil rather than many
 * narrow ones that draw a trajectory.
 *
 * One rule carries the difference in time: **wind's parcels die on the wing and
 * aeroform's linger**, because the air it made stays after the gust would have
 * passed. Every role wind decays, this row leaks. Only `ember`, a fleck thrown
 * off rather than air made, still decays. The entry's semantics agree — the
 * widest `spread` of any sigil, the lowest `focus`, a positive `lifetimeBias`.
 */

import type { LookRow } from './look.js';

/** The air it makes. Paler and greyer than wind's `AIR`, so the row reads as substance. */
const VEIL = [214, 236, 236] as const;
/** One step down, barely: low core-to-edge contrast is what makes a volume soft. */
const BLOOM = [186, 216, 224] as const;
/** The deepest this row goes, still well short of wind's `DUST`. */
const MIST = [156, 186, 198] as const;

export const AEROFORM_LOOKS: LookRow = {
	core: {
		sprite: 'disc',
		tint: { core: [236, 250, 250], edge: VEIL },
		sizePx: [5, 16],
		trail: { frames: 2, widthScale: 0.7 },
		blend: 'lighter',
		stretch: 0.4,
		fade: 'leak'
	},
	body: {
		sprite: 'disc',
		tint: { core: VEIL, edge: BLOOM },
		sizePx: [7, 17],
		trail: { frames: 3, widthScale: 0.8 },
		blend: 'lighter',
		stretch: 0.5,
		fade: 'leak'
	},
	wisp: {
		sprite: 'disc',
		tint: { core: BLOOM, edge: MIST },
		sizePx: [7, 16],
		trail: { frames: 4, widthScale: 0.75 },
		blend: 'lighter',
		stretch: 0.6,
		fade: 'leak'
	},
	ember: {
		sprite: 'streak',
		tint: { core: VEIL, edge: BLOOM },
		sizePx: [3, 6],
		trail: { frames: 3, widthScale: 0.45 },
		blend: 'lighter',
		stretch: 1.4,
		fade: 'decay'
	},
	skin: {
		sprite: 'disc',
		tint: { core: BLOOM, edge: MIST },
		sizePx: [9, 16],
		trail: null,
		blend: 'source-over',
		stretch: 0.2,
		fade: 'leak'
	}
};
