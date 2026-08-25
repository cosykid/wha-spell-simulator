/**
 * @file The fan tracks: plane-hugging radial flow (R-07), and R-13's deferred
 * vessel, which a fan still stands in for.
 *
 * R-08 lives here. A dispersion sign contributes to `(S, P, C, Gamma)` exactly
 * as a column does, so the two cannot be told apart in space. They are told
 * apart in **time**: a fan's drive carries the `leak` curve at a lower gain, so
 * dispersion reads as a long, low bleed where a column reads as a push.
 */

import { aboveFloor, NEGLIGIBLE_INK, saturate } from './gain.js';
import type { Population, Site, SpellPlan, Track } from '../../../types.js';

const FAN_TUNING = {
	/** Dispersion magnitude at which a fan reads half as strong as it can get. */
	halfDispersion: 4,
	/** The vessel's stir gets its own half-way point. */
	halfSwirl: 6,
	/** Parcels per second at full strength. */
	rate: 110,
	/** Seal units per second at full strength. */
	speed: 1.5,
	speedFloor: 0.35,
	// Finite-core radius, salvaged from the deleted field engine's radial core:
	// the push peaks off-center so the seal origin is not a singularity.
	core: 0.4,
	/** Plane-hugging (R-07): a fan barely leaves the paper, and never climbs past its ceiling. */
	rise: 0.18,
	ceiling: 0.35,
	/** R-08. The dispersion fan's drive: lower than a jet's, and it runs a beat longer. */
	leakGain: 0.55,
	/** R-13's vessel is deferred, so a stand-in fan plays it conservatively. */
	routedRateScale: 0.7,
	routedDriveGain: 0.45
} as const;

interface FanShape {
	id: string;
	speed: number;
	swirl: number;
	rate: number;
	driveGain: number;
	look: Track['look'];
	/** The drawn dispersion ink behind this sheet, empty where none stands behind it. */
	sites: Site[];
	symmetry: number | null;
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
			ceiling: FAN_TUNING.ceiling,
			sites: shape.sites,
			symmetry: shape.symmetry
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
			look: 'body',
			// The dispersion ink as drawn. R-07 also raises a fan out of outward
			// column ink, and that arrangement stays under the plan's column sites,
			// so this list is empty on a fan no dispersion sign asked for.
			sites: plan.sites.dispersion,
			symmetry: plan.symmetry
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
			look: 'body',
			// A vessel is a contained orb, not an arrangement of chevrons, so the
			// stand-in stirs no sites of its own.
			sites: [],
			symmetry: plan.symmetry
		},
		population
	);
}
