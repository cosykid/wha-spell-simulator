/**
 * @file R-21, the spun column: a strongly helical intake feeding a clash column
 * spins the whole column into a single vortex.
 *
 * `docs/ground-truth.md` section 7 already reads a slanted pull as helical
 * inflow. When that inflow feeds a standing clash the two are one phenomenon —
 * ambient angular momentum organizing a driven updraft into rotation, the fire
 * whirl — so the plan resolves one whirl instead of a beam standing in discrete
 * inflow branches. The clash and the intake are consumed: their ink pays the
 * circulation the vortex track is sized from, and the plan notes `spun-column`
 * where they went.
 *
 * Scope is deliberately narrow. An outward helical push feeds no column, and
 * intake swirl opposing circulation the columns drew themselves is a new ruling,
 * not a licence to cancel ink; both keep the ruled jet-plus-intake reading.
 */

import type { SpellPlan } from '../../types.js';

const SPIN_UP_TUNING = {
	/** Clash below this leaves no column to spin; the intake stays an inflow. */
	minClash: 0.3,
	/** Swirl below this is a hand's incidental twist, sized like the vortex dead band. */
	minSwirl: 0.55,
	/** Sine of the pulls' slant below which the inflow reads as a straight inhale. */
	minTwistShare: 0.35,
	/**
	 * Circulation paid per unit of clash: the updraft is the whirl's engine, and
	 * the whirl it powers must never stand shorter than the beam it consumed.
	 * Sized with `drawGain` so a real hand-drawn whirl seal (clash near 1, draw
	 * near 1.5 — far below the synthetic lab corpus) lands where the lab's own
	 * pinwheel does on the vortex track's saturation curve.
	 */
	clashGain: 6,
	/** Circulation paid per unit of draw: the inflow is what keeps the whirl fed. */
	drawGain: 1.5
} as const;

/** Matches `resolvePlan`'s floor: below this a component reads as absent. */
const NEGLIGIBLE = 1e-6;

/**
 * R-21. The fused plan, or null where the gates leave the seal unfused. The
 * caller notes the fusion, so the plan text shows the jet and the intake were
 * consumed rather than never drawn.
 */
export function spinUpColumn(plan: SpellPlan): SpellPlan | null {
	const intake = plan.intake;
	if (!intake || plan.aim.z < SPIN_UP_TUNING.minClash) {
		return null;
	}
	if (intake.draw < 0) {
		return null;
	}
	const slant = Math.hypot(intake.draw, intake.swirl);
	const twistShare = slant > NEGLIGIBLE ? Math.abs(intake.swirl) / slant : 0;
	if (
		Math.abs(intake.swirl) < SPIN_UP_TUNING.minSwirl ||
		twistShare < SPIN_UP_TUNING.minTwistShare
	) {
		return null;
	}
	if (Math.abs(plan.circulation) > NEGLIGIBLE && plan.circulation * intake.swirl < 0) {
		return null;
	}
	const transfer =
		Math.sign(intake.swirl) *
		(Math.abs(intake.swirl) +
			SPIN_UP_TUNING.clashGain * plan.aim.z +
			SPIN_UP_TUNING.drawGain * intake.draw);
	return {
		...plan,
		aim: { x: plan.aim.x, y: plan.aim.y, z: 0 },
		circulation: plan.circulation + transfer,
		intake: null
	};
}
