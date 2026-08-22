/**
 * @file R-13's spring: the levitation family as a `HoldSpec`.
 *
 * Levitation runs the same vector algebra as the column (`columns.ts`) into its
 * own budget — column couples the ink to the element flow, levitation couples it
 * to the mass above the seal (`docs/ground-truth.md` section 6). The clash is
 * the grip; the lateral term slides the hover locus against the arrows, because
 * the substrate is thrust along them.
 */

import { foldAggregate } from './columns.js';
import type { HoldSpec, SignReading } from '../../types.js';

const HOLD_TUNING = {
	/** Rest height per unit of mean stem length: longer signs park the mass further out. */
	restHeightPerLength: 0.9,
	/** How far the hover locus slides against the lateral arrows. */
	lateralSlide: 0.35,
	/** Below this a channel reads as absent rather than weak, so ink dust builds nothing. */
	floor: 0.05
};

/**
 * The hold, or null when the levitation ink closes neither channel.
 *
 * Two channels, not one. The clash is the grip (section 6), and R-16 makes the
 * torque independent of it: a tangential ring is a rotor, so a hold exists on
 * the strength of its spin alone and reports `grip` as zero. R-17 keeps outward
 * ink a dud, because negative convergence grips nothing and no canon case shows
 * one. A caller that had levitation signs and got null back reads the plan's
 * note to learn which of the two it drew.
 */
export function resolveHold(levitation: SignReading[]): HoldSpec | null {
	if (!levitation.length) {
		return null;
	}
	const aggregate = foldAggregate(levitation);
	const grip = Math.max(aggregate.convergence, 0);
	const spin = aggregate.circulation;
	if (grip <= HOLD_TUNING.floor && Math.abs(spin) <= HOLD_TUNING.floor) {
		return null;
	}
	const meanLength = aggregate.budget / levitation.length;
	return {
		at: {
			x: -aggregate.lateral.x * HOLD_TUNING.lateralSlide,
			y: -aggregate.lateral.y * HOLD_TUNING.lateralSlide,
			z: meanLength * HOLD_TUNING.restHeightPerLength
		},
		grip,
		spin,
		budget: aggregate.budget
	};
}

/**
 * Why a levitation seal closed no hold, in R-17's vocabulary. Outward ink is
 * inverted; anything else that reaches here simply never built either channel.
 */
export function holdFailure(levitation: SignReading[]): 'levitation-inverted' | 'levitation-inert' {
	return foldAggregate(levitation).convergence < -HOLD_TUNING.floor
		? 'levitation-inverted'
		: 'levitation-inert';
}
