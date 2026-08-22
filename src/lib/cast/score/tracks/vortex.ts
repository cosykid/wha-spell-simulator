/**
 * @file The vortex track: R-05's circulation `Gamma`, sized into a Rankine cell.
 *
 * The sign convention is R-05's, unchanged all the way down: positive `Gamma` is
 * counter-clockwise seen from +z, and the kernel turns that way. Magnitude sets
 * how tall the funnel stands, which is `vortexHeight` from the salvaged
 * `vortex.ts` written in this layer's own vocabulary — height is authored, not
 * emergent, so a faint pinwheel is a low whirl and never a stunted tornado.
 *
 * A dead-band guards the entrance. Folding a dozen hand-drawn signs leaves a few
 * percent of incidental tangential residue in `Gamma`, and the whole reason the
 * redesign replaced superposition is that residue at that size used to author
 * behaviour. Here it authors nothing.
 */

import { aboveFloor, saturate } from './gain.js';
import type { Population, SpellPlan, Track } from '../../../types.js';

const VORTEX_TUNING = {
	/**
	 * Circulation below this is drawing noise, not a pinwheel. Sized against the
	 * lab corpus, whose smallest deliberate arrangement folds several ink units.
	 */
	deadBand: 0.25,
	/** Circulation magnitude at which the whirl reads half as strong as it can get. */
	halfCirculation: 6,
	/** Parcels per second at full strength. */
	rate: 120,
	/** Tangential seal units per second on the funnel wall, at full strength. */
	spin: 2.2,
	spinFloor: 0.3,
	/**
	 * Seal units: the core radius at the foot and at the crown, so the funnel
	 * flares as it climbs (TWIST_R0 / TWIST_R1). Widened against the branch's
	 * ratios, because there the funnel stood in a room and here it stands on a
	 * seal one ring radius across: a foot near the salvaged `vortexEye` of 0.45
	 * is what makes the hollow read at this scale.
	 */
	footRadius: 0.32,
	crownRadius: 0.7,
	/** Seal units the crown stands at when the circulation is at full strength. */
	height: 1.6,
	heightFloor: 0.35,
	/**
	 * The cell's three gains, per unit of spin (TWIST_LIFT, TWIST_FEED,
	 * TWIST_SPILL). The branch scaled them by a channel speed times `|Gamma|`;
	 * here the spin already carries both, so the ratios survive and the absolute
	 * sizes are seal-space numbers.
	 */
	lift: 0.9,
	feed: 0.7,
	spill: 0.5
} as const;

/**
 * R-05. Tangential ink turns the domain: a pinwheel of columns is a vortex. Null
 * below the dead-band, which is where a hand's incidental twist lives.
 */
export function circulationVortex(plan: SpellPlan, population: Population): Track<'vortex'> | null {
	if (Math.abs(plan.circulation) <= VORTEX_TUNING.deadBand) {
		return null;
	}
	const strength = saturate(plan.circulation, VORTEX_TUNING.halfCirculation);
	const spin =
		Math.sign(plan.circulation) *
		VORTEX_TUNING.spin *
		aboveFloor(VORTEX_TUNING.spinFloor, strength);
	return {
		id: 'vortex-circulation',
		kind: 'vortex',
		population,
		params: {
			spin,
			footRadius: VORTEX_TUNING.footRadius,
			crownRadius: VORTEX_TUNING.crownRadius,
			height: VORTEX_TUNING.height * aboveFloor(VORTEX_TUNING.heightFloor, strength),
			updraft: VORTEX_TUNING.lift * Math.abs(spin),
			feed: VORTEX_TUNING.feed * Math.abs(spin),
			spill: VORTEX_TUNING.spill * Math.abs(spin)
		},
		// A cell has to be seen going round, so the vortex emits across the whole
		// body and drives flat: R-02 stops it at the top of release like everything else.
		emission: { from: 'strike', to: 'body', curve: 'attack', gain: VORTEX_TUNING.rate * strength },
		drive: { from: 'strike', to: 'release', curve: 'leak', gain: 1 },
		look: 'body'
	};
}
