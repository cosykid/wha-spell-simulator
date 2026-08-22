/**
 * @file The shimmer track: R-10's thin ambient medium, in every score.
 *
 * R-10 says the world contains exactly three things — the spell's own
 * manifestation, a thin ambient medium of the seal's element seeded through the
 * domain, and the substrate. Two of those are already modelled. This is the
 * third, and it is unconditional: every cast gets one, because R-11 makes
 * "manifests nothing" a look and this is what that look is made of, and because
 * an `intake` or a `vortex` in manipulate mode needs something to act on.
 *
 * It is also the one exception to the charge beat's silence. R-01 gives the
 * charge content — "ink brightens, ambient medium draws inward" — so this track
 * alone opens its emission there, at a gentle drift. R-02 is untouched: the
 * emission still stops at the end of `body`, and every other track still starts
 * at the strike.
 */

import { clamp } from '../../../utils/geometry.js';
import type { SpellPlan, Track } from '../../../types.js';

const SHIMMER_TUNING = {
	/**
	 * Parcels per second at the top of the charge. Low on purpose: the medium is
	 * thin, and the spell's own manifestation has to out-read it the moment it
	 * arrives.
	 */
	rate: 26,
	/** Seal units per second the medium draws inward while a parcel is young. */
	drift: 0.5,
	/** Seconds that draw takes to settle into a hover. Most of the charge beat. */
	settleS: 1.1,
	/** Seal units per second of the idle curl the settled medium keeps. */
	wander: 0.22,
	/** Seal units above the paper the medium hovers around. */
	ceiling: 0.5,
	/** A sloppier seal stirs a slacker medium. */
	qualityFloor: 0.6
} as const;

/**
 * R-10 and R-11. The world the cast happens in: always present, always ambient,
 * never loud.
 */
export function ambientShimmer(plan: SpellPlan): Track<'shimmer'> {
	const floor = SHIMMER_TUNING.qualityFloor;
	const quality = floor + (1 - floor) * clamp(plan.quality);
	return {
		id: 'shimmer-ambient',
		kind: 'shimmer',
		population: 'ambient',
		params: {
			drift: SHIMMER_TUNING.drift,
			settleS: SHIMMER_TUNING.settleS,
			wander: SHIMMER_TUNING.wander * quality,
			ceiling: SHIMMER_TUNING.ceiling
		},
		// R-01: seeded through the charge, thinning as the spell's own manifestation
		// takes the frame. R-02: still finished by the end of `body`.
		emission: { from: 'charge', to: 'body', curve: 'leak', gain: SHIMMER_TUNING.rate },
		drive: { from: 'charge', to: 'release', curve: 'hold', gain: 1 },
		// `skin` is the look table's surface role: no trail, no additive blend, a
		// quiet presence that reads as something being moved rather than something
		// being thrown. Wind's row already documents it as R-11's answer.
		look: 'skin'
	};
}
