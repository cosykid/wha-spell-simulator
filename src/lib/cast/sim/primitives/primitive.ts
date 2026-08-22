/**
 * @file The `Primitive` contract from `docs/animation-redesign.md` section 4.
 *
 * `velocity` is **pure and local**: it reads its own params, one point and one
 * age, and nothing else. No globals, no clock, no reaching into another track.
 * That restriction is the whole reason the sim is replayable, and it is why
 * cross-track interaction has to be declared as a plan coupling rather than
 * quietly emerging from a shared sum.
 *
 * `throttle` is the one member allowed to read the population, added for R-20's
 * fill-to-capacity ruling, which is stated in terms of held mass and cannot be
 * expressed per-parcel. It is safe for the same reason `velocity` is: it derives
 * its answer from the current state every step and never accumulates, so
 * stepping fresh to a timestamp recomputes the identical gate.
 */

import type { PrimitiveKind, Vec3 } from '../../../types.js';
import type { Aperture } from '../../../types.js';
import type { Parcel, ParcelSeed } from '../parcel.js';
import type { Rng } from '../rng.js';

export interface Primitive<P> {
	kind: PrimitiveKind;
	/** A new parcel's own state, drawn off the aperture (R-09). */
	spawn(params: P, aperture: Aperture, rng: Rng): ParcelSeed;
	/** The kernel: the flow this primitive wants at `at`, for a parcel `ageS` old. */
	velocity(params: P, at: Vec3, ageS: number): Vec3;
	/** Floor, shell or capacity, applied after the step. `stepS` is the step's length. */
	constrain?(params: P, parcel: Parcel, stepS: number): void;
	/** R-20: an emission multiplier read off the live population. 1 leaves the valve open. */
	throttle?(params: P, parcels: readonly Parcel[]): number;
}

/** Parcels spawn just off the paper, the way the field effect seeded them. */
export const SPAWN_HEIGHT = 0.02;

/** The seal plane is the floor: grounded parcels pool instead of sinking through. */
export function restOnSeal(parcel: Parcel): void {
	if (parcel.at.z < 0) {
		parcel.at.z = 0;
		parcel.velocity.z = 0;
	}
}
