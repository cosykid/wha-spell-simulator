/**
 * @file The burst track: the impulse ring every cast opens with.
 *
 * R-01 gives `strike` one job, "the impulse: burst ring, first parcels at peak
 * drive", so the burst is the only track whose emission is confined to that one
 * beat. It is also the reason R-11 has something to stand on: a plan that
 * resolved to nothing still strikes, just quietly, and the renderer never gets
 * an empty path to fall into.
 */

import { aboveFloor, saturate } from './gain.js';
import type { Population, SpellPlan, Track } from '../../../types.js';

export const BURST_TUNING = {
	/** Budget at which the ring reads half as bright as it can get. */
	halfBudget: 6,
	/** Parcels per second at the peak of the strike. */
	rate: 900,
	/** Seal units per second at the ring's birth. */
	speed: 1.8,
	speedFloor: 0.4,
	/** Seal units per second out of the paper: the ring lifts as it spreads. */
	rise: 0.5,
	/** Seal units where the impulse has spent half its speed. */
	reach: 1.2,
	/** Fraction of the impulse still pushing one second in. */
	persistence: 0.25,
	/** R-11. The quietest a strike may be. A cancelled seal still opens with a ring. */
	floorStrength: 0.12
} as const;

/**
 * The strike, sized by the plan's burst budget (R-13: column ink plus ink whose
 * only ruled contribution is power).
 *
 * R-15 is the one exception. Ink whose moments cancel fires the bare shockwave
 * and buys nothing with it, so an inert plan strikes at the floor and reads
 * exactly like an unmarked ring. Section 1 already spends that look on a seal
 * that fizzles, and cancelled ink is the second cause of the same outcome.
 */
export function burstTrack(plan: SpellPlan, population: Population): Track<'burst'> {
	const strength = plan.notes.includes('inert-quadrupole')
		? BURST_TUNING.floorStrength
		: Math.max(saturate(plan.budget, BURST_TUNING.halfBudget), BURST_TUNING.floorStrength);
	return {
		id: 'burst',
		kind: 'burst',
		population,
		params: {
			speed: BURST_TUNING.speed * aboveFloor(BURST_TUNING.speedFloor, strength),
			rise: BURST_TUNING.rise,
			reach: BURST_TUNING.reach,
			persistence: BURST_TUNING.persistence
		},
		// One hump over the strike and nothing after it: the ring is an event.
		emission: { from: 'strike', to: 'strike', curve: 'pulse', gain: BURST_TUNING.rate * strength },
		drive: { from: 'strike', to: 'body', curve: 'decay', gain: 1 },
		look: 'core'
	};
}
