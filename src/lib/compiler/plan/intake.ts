/**
 * @file R-13's ambient coupling: the pull family as an `IntakeSpec`.
 *
 * Same algebra as the column (`columns.ts`), its own budget, and a different
 * target: pull couples the ink to matter already in the environment, never to
 * the spell's own manifestation (`docs/ground-truth.md` section 7).
 *
 * There is no separate inverted-pull case, exactly as R-07 refuses one for the
 * column: `draw` is a signed dial, so pulls facing outward push the ambient
 * medium away without a second code path.
 */

import { foldAggregate } from './columns.js';
import type { IntakeSpec, SignReading } from '../../types.js';

export function resolveIntake(pulls: SignReading[]): IntakeSpec | null {
	if (!pulls.length) {
		return null;
	}
	const aggregate = foldAggregate(pulls);
	return {
		budget: aggregate.budget,
		draw: aggregate.convergence,
		swirl: aggregate.circulation,
		lateral: aggregate.lateral
	};
}
