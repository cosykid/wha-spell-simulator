/**
 * @file The parcel: one moving piece of a cast, and the only thing the sim
 * integrates.
 *
 * A parcel belongs to exactly one track and feels only that track's kernel. That
 * single sentence is what replaces the old field's sum-over-sources: there is no
 * point at which every source acts on every parcel, so a stray few percent of
 * incidental bias can no longer drift the whole domain.
 */

import type { LookRole, Population, Vec3 } from '../../types.js';

export interface Parcel {
	/** The track this parcel belongs to. It feels no other track's kernel. */
	trackId: string;
	population: Population;
	/** Which look row paints it (phase 4). */
	look: LookRole;
	/** Seal space: ring center origin, one unit = ring radius, z out of the paper. */
	at: Vec3;
	/** Seal units per second. */
	velocity: Vec3;
	/** The step it was spawned on. Age is derived from this, never accumulated. */
	bornStep: number;
	/** Seconds alive, always `(steps - bornStep) * stepSeconds`. */
	ageS: number;
	/** Seconds it may live. Past this it retires. */
	lifetimeS: number;
}

/** What a primitive knows how to make: a parcel's own state, before it is bound to a track. */
export interface ParcelSeed {
	at: Vec3;
	velocity: Vec3;
	lifetimeS: number;
}

/**
 * The redesign writes `Primitive.spawn` as returning a `Parcel`. The track
 * binding is the caller's to know, so a primitive returns the seed and this
 * attaches the rest.
 */
export function bindParcel(
	seed: ParcelSeed,
	track: { id: string; population: Population; look: LookRole },
	bornStep: number
): Parcel {
	return {
		trackId: track.id,
		population: track.population,
		look: track.look,
		at: seed.at,
		velocity: seed.velocity,
		bornStep,
		ageS: 0,
		lifetimeS: seed.lifetimeS
	};
}
