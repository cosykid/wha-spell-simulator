/**
 * @file The canon-snap seam. Canon spells should resolve to the plan the source
 * material shows, not merely to something near it — but the table that says so
 * cannot be written until the spec's open canon questions are ruled, so the seam
 * ships with an empty table and behaves as a passthrough (PDF defect J).
 *
 * **Fingerprint scheme.** A fingerprint is a slash-joined list of coarse classes
 * read off a resolved plan, never off raw geometry:
 *
 *     `sigil / aperture kind / aim / fan / spin / hold / intake / lens`
 *
 * Each part is quantized hard enough that a hand-drawn seal and its canon
 * reference land on the same key, and no part is a continuous number, so a
 * snapped entry can never depend on a threshold nobody can see. A canon entry
 * overrides only the plan fields it names.
 *
 * @example
 * snapPlan(planFingerprint(plan), plan); // identity while CANON_SNAPS is empty
 */

import type { SpellPlan } from '../../types.js';

export type Fingerprint = string;

/** Empty until the open canon questions in `docs/animation-spec.md` are ruled. */
export const CANON_SNAPS: Record<Fingerprint, Partial<SpellPlan>> = {};

/** Below this a component reads as absent rather than small. */
const QUIET = 0.05;

function aimClass(plan: SpellPlan): string {
	const lateral = Math.hypot(plan.aim.x, plan.aim.y);
	if (lateral < QUIET && plan.aim.z < QUIET) {
		return 'aim:none';
	}
	if (lateral < QUIET) {
		return 'aim:up';
	}
	return plan.aim.z < QUIET ? 'aim:flat' : 'aim:tilted';
}

function spinClass(plan: SpellPlan): string {
	if (Math.abs(plan.circulation) < QUIET) {
		return 'spin:none';
	}
	return plan.circulation > 0 ? 'spin:ccw' : 'spin:cw';
}

function intakeClass(plan: SpellPlan): string {
	if (!plan.intake) {
		return 'intake:none';
	}
	return plan.intake.draw >= 0 ? 'intake:draw' : 'intake:push';
}

export function planFingerprint(plan: SpellPlan): Fingerprint {
	return [
		plan.sigil ?? plan.element ?? 'none',
		plan.aperture.kind,
		aimClass(plan),
		plan.dispersion >= QUIET ? 'fan' : 'fan:none',
		spinClass(plan),
		plan.hold ? 'hold' : 'hold:none',
		intakeClass(plan),
		plan.focus > 1 + QUIET ? 'lens' : 'lens:none'
	].join('/');
}

/** Applies the canon entry for this fingerprint, if the table has one. */
export function snapPlan(fingerprint: Fingerprint, plan: SpellPlan): SpellPlan {
	const canon = CANON_SNAPS[fingerprint];
	return canon ? { ...plan, ...canon } : plan;
}
