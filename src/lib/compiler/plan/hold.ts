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
	lateralSlide: 0.35
};

/**
 * The hold, or null when the levitation ink never closes a grip. A caller that
 * had levitation signs and got null back is looking at open canon questions 3
 * (does a levitation rotor spin without a grip?) and 4 (is inverted levitation a
 * dud, a press, or a repulsor?). Least-committal default until those are ruled:
 * a dud, tagged with a note rather than invented behavior.
 */
export function resolveHold(levitation: SignReading[]): HoldSpec | null {
	if (!levitation.length) {
		return null;
	}
	const aggregate = foldAggregate(levitation);
	const grip = Math.max(aggregate.convergence, 0);
	if (grip <= 0) {
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
		spin: aggregate.circulation,
		budget: aggregate.budget
	};
}
