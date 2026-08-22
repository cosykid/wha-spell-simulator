/**
 * @file The fan tracks: plane-hugging radial flow (R-07), and the phase 4
 * primitives a fan stands in for until they land.
 *
 * R-08 lives here. A dispersion sign contributes to `(S, P, C, Gamma)` exactly
 * as a column does, so the two cannot be told apart in space. They are told
 * apart in **time**: a fan's drive carries the `leak` curve at a lower gain, so
 * dispersion reads as a long, low bleed where a column reads as a push.
 */

import { aboveFloor, NEGLIGIBLE_INK, saturate } from './gain.js';
import type { Population, SpellPlan, Track } from '../../../types.js';

const FAN_TUNING = {
	/** Dispersion magnitude at which a fan reads half as strong as it can get. */
	halfDispersion: 4,
	/** Circulation and draw magnitudes get their own half-way points. */
	halfSwirl: 6,
	halfDraw: 5,
	/** Parcels per second at full strength. */
	rate: 110,
	/** Seal units per second at full strength. */
	speed: 1.5,
	speedFloor: 0.35,
	// Finite-core radius, salvaged from field/sampleField.ts (FIELD_TUNING.radialCore):
	// the push peaks off-center so the seal origin is not a singularity.
	core: 0.4,
	/** Plane-hugging (R-07): a fan barely leaves the paper, and never climbs past its ceiling. */
	rise: 0.18,
	ceiling: 0.35,
	/** R-08. The dispersion fan's drive: lower than a jet's, and it runs a beat longer. */
	leakGain: 0.55,
	/** Phase 4 owns vortex, intake and vessel. A stand-in fan plays them conservatively. */
	routedRateScale: 0.7,
	routedDriveGain: 0.45,
	/** Canon's default pull is inward, so pull ink with no trusted facing still inhales. */
	defaultDraw: 5
} as const;

interface FanShape {
	id: string;
	speed: number;
	swirl: number;
	rate: number;
	driveGain: number;
	look: Track['look'];
}

/** One fan, with the R-08 timing every fan shares: emission over the body, drive that leaks. */
function fanTrack(shape: FanShape, population: Population): Track<'fan'> {
	return {
		id: shape.id,
		kind: 'fan',
		population,
		params: {
			speed: shape.speed,
			swirl: shape.swirl,
			rise: FAN_TUNING.rise,
			core: FAN_TUNING.core,
			ceiling: FAN_TUNING.ceiling
		},
		// R-08's long body in emission terms: a fan trickles at a steady rate for
		// the whole cast where a jet front-loads its push and a burst is one hump.
		emission: { from: 'strike', to: 'body', curve: 'hold', gain: shape.rate },
		drive: { from: 'strike', to: 'release', curve: 'leak', gain: shape.driveGain },
		look: shape.look
	};
}

/** R-07/R-08. Outward columns give `C < 0`, which is this: a radial fan that leaks. */
export function dispersionFan(plan: SpellPlan, population: Population): Track<'fan'> | null {
	if (plan.dispersion <= NEGLIGIBLE_INK) {
		return null;
	}
	const strength = saturate(plan.dispersion, FAN_TUNING.halfDispersion);
	return fanTrack(
		{
			id: 'fan-dispersion',
			speed: FAN_TUNING.speed * aboveFloor(FAN_TUNING.speedFloor, strength),
			swirl: 0,
			rate: FAN_TUNING.rate * strength,
			driveGain: FAN_TUNING.leakGain,
			look: 'body'
		},
		population
	);
}

/**
 * The swirl, routed. `vortex` is a phase 4 primitive; until it lands its
 * circulation is played as a fan that turns, which keeps the spin visible
 * without inventing an eye the real vortex will own.
 */
export function circulationFan(plan: SpellPlan, population: Population): Track<'fan'> | null {
	if (Math.abs(plan.circulation) <= NEGLIGIBLE_INK) {
		return null;
	}
	const strength = saturate(plan.circulation, FAN_TUNING.halfSwirl);
	return fanTrack(
		{
			id: 'fan-circulation',
			speed: 0,
			swirl: Math.sign(plan.circulation) * FAN_TUNING.speed * strength,
			rate: FAN_TUNING.rate * FAN_TUNING.routedRateScale * strength,
			driveGain: FAN_TUNING.routedDriveGain,
			look: 'wisp'
		},
		population
	);
}

/**
 * The pull family, routed. `intake` is a phase 4 primitive. A fan run backwards
 * is the honest stand-in: negative speed draws inward, which is R-11's ambient
 * medium visibly streaming toward the seal rather than an empty canvas.
 */
export function intakeFan(plan: SpellPlan, population: Population): Track<'fan'> | null {
	const intake = plan.intake;
	if (!intake) {
		return null;
	}
	const aimless =
		Math.abs(intake.draw) <= NEGLIGIBLE_INK && Math.abs(intake.swirl) <= NEGLIGIBLE_INK;
	const draw = aimless ? FAN_TUNING.defaultDraw : intake.draw;
	const drawStrength = saturate(draw, FAN_TUNING.halfDraw);
	const swirlStrength = saturate(intake.swirl, FAN_TUNING.halfSwirl);
	const strength = Math.max(drawStrength, swirlStrength);
	return fanTrack(
		{
			id: 'fan-intake',
			speed: -Math.sign(draw) * FAN_TUNING.speed * drawStrength,
			swirl: Math.sign(intake.swirl) * FAN_TUNING.speed * swirlStrength,
			rate: FAN_TUNING.rate * FAN_TUNING.routedRateScale * strength,
			driveGain: FAN_TUNING.routedDriveGain,
			look: 'wisp'
		},
		population
	);
}

/**
 * The orb, routed. `vessel` is deferred and always null in v1, so this branch
 * exists to keep the promise that every plan compiles: a vessel that ever
 * arrives is stirred by a fan rather than dropped.
 */
export function vesselFan(plan: SpellPlan, population: Population): Track<'fan'> | null {
	const vessel = plan.vessel;
	if (!vessel) {
		return null;
	}
	const strength = saturate(vessel.stir, FAN_TUNING.halfSwirl);
	return fanTrack(
		{
			id: 'fan-vessel',
			speed: 0,
			swirl: Math.sign(vessel.stir) * FAN_TUNING.speed * strength,
			rate: FAN_TUNING.rate * FAN_TUNING.routedRateScale * strength,
			driveGain: FAN_TUNING.routedDriveGain,
			look: 'body'
		},
		population
	);
}
