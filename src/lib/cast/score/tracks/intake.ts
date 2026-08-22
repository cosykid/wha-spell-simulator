/**
 * @file The intake track: R-13's ambient coupling, the pull family.
 *
 * Two rulings decide everything here. **R-10**: pull manipulates, it never
 * creates, so an intake track is `ambient` whatever the sigil's own class is —
 * `docs/ground-truth.md` section 7 exempts the spell's own manifestation from
 * the pull field outright, or grasping wind would swallow its own burst. And
 * **R-11**: a pull-only seal manifests nothing of its own, and that is a look,
 * so the medium it inhales is what the viewer sees.
 *
 * The three channels are section 7's: a signed radial sink, a lateral drag along
 * the arrows, and a twist whose sense follows their turn. Only the twist lifts,
 * is the swirl lift salvaged from the deleted field engine — a straight pull is a
 * flat inflow and a slanted one is canon's helical, apple-plucking vortex.
 */

import { aboveFloor, NEGLIGIBLE_INK, saturate } from './gain.js';
import type { SpellPlan, Track, Vector } from '../../../types.js';

const INTAKE_TUNING = {
	/** Draw and swirl magnitudes at which each channel reads half as strong as it can get. */
	halfDraw: 5,
	halfSwirl: 6,
	halfDrift: 5,
	/** Parcels per second at full strength. */
	rate: 130,
	/** Seal units per second at full strength, on each channel. */
	speed: 1.5,
	speedFloor: 0.3,
	/** Canon's default pull is inward, so pull ink with no trusted facing still inhales. */
	defaultDraw: 5,
	/** Radius where the draw peaks, from the old radial core: the center is a pool. */
	pool: 0.4,
	/** Lift per unit of swirl, from the old swirl lift, and the height it fades over. */
	swirlLift: 0.85,
	ceiling: 0.7
} as const;

/** Unit lateral, or nothing when the arrows have no net side. */
function lateralUnit(lateral: Vector): Vector {
	const length = Math.hypot(lateral.x, lateral.y);
	if (length <= NEGLIGIBLE_INK) {
		return { x: 0, y: 0 };
	}
	return { x: lateral.x / length, y: lateral.y / length };
}

/**
 * R-13. The pull family, acting on the ambient population and only on it. The
 * population argument every other builder takes is deliberately absent: R-10
 * fixes this one.
 */
export function intakeTrack(plan: SpellPlan): Track<'intake'> | null {
	const intake = plan.intake;
	if (!intake) {
		return null;
	}
	const aimless =
		Math.abs(intake.draw) <= NEGLIGIBLE_INK &&
		Math.abs(intake.swirl) <= NEGLIGIBLE_INK &&
		Math.hypot(intake.lateral.x, intake.lateral.y) <= NEGLIGIBLE_INK;
	const draw = aimless ? INTAKE_TUNING.defaultDraw : intake.draw;
	const drawStrength = saturate(draw, INTAKE_TUNING.halfDraw);
	const swirlStrength = saturate(intake.swirl, INTAKE_TUNING.halfSwirl);
	const driftStrength = saturate(
		Math.hypot(intake.lateral.x, intake.lateral.y),
		INTAKE_TUNING.halfDrift
	);
	const strength = Math.max(drawStrength, swirlStrength, driftStrength);
	const swirl = Math.sign(intake.swirl) * INTAKE_TUNING.speed * swirlStrength;
	return {
		id: 'intake-pull',
		kind: 'intake',
		population: 'ambient',
		params: {
			draw: Math.sign(draw) * INTAKE_TUNING.speed * drawStrength,
			swirl,
			drift: INTAKE_TUNING.speed * driftStrength,
			lateral: lateralUnit(intake.lateral),
			pool: INTAKE_TUNING.pool,
			rise: INTAKE_TUNING.swirlLift * Math.abs(swirl),
			ceiling: INTAKE_TUNING.ceiling
		},
		// The grasp charges fast and then throttles as material gathers (section 7's
		// capacitor), which in envelope terms is a steady feed and a drive that leaks.
		emission: { from: 'strike', to: 'body', curve: 'hold', gain: INTAKE_TUNING.rate * strength },
		drive: {
			from: 'strike',
			to: 'release',
			curve: 'leak',
			gain: aboveFloor(INTAKE_TUNING.speedFloor, strength)
		},
		look: 'wisp'
	};
}
