/**
 * @file The shimmer kernel: R-10's thin ambient medium, the world every cast
 * happens in.
 *
 * R-11 makes "manifests nothing" a look rather than an absence, and this is what
 * that look is made of: a sparse, slow, long-lived population seeded through the
 * domain, present in every score, and the thing an `intake` or a `vortex` has to
 * act on when the seal only manipulates.
 *
 * It is also R-01's charge beat. The charge is content — "ink brightens, ambient
 * medium draws inward" — so a young parcel draws toward the seal and then
 * settles into a hover. The draw is read off the parcel's own age rather than
 * the cast clock, because a kernel is local by contract; the score's emission
 * envelope puts most of these parcels in the charge, which is what makes the
 * inward drift a beat rather than a permanent inflow.
 */

import { sampleAperture } from '../aperture.js';
import { NEGLIGIBLE_DISTANCE } from '../falloff.js';
import { restOnSeal, SPAWN_HEIGHT, type Primitive } from './primitive.js';
import type { ShimmerParams, Vec3 } from '../../../types.js';

const SHIMMER_SIM = {
	/** How far past the aperture the medium is seeded. It fills the domain, not the valve. */
	spread: 1.5,
	/** Seconds an ambient parcel lives. Longest in the sim: the medium outlasts the spell. */
	lifetimeS: 5.5,
	lifetimeSpread: 0.25,
	/** Wavelength of the idle curl, in seal units. One ring radius reads as a slow eddy. */
	curlScale: Math.PI
} as const;

export const SHIMMER: Primitive<ShimmerParams> = {
	kind: 'shimmer',

	spawn(params, aperture, rng) {
		const at = sampleAperture(aperture, rng);
		return {
			at: {
				x: at.x * SHIMMER_SIM.spread,
				y: at.y * SHIMMER_SIM.spread,
				// Seeded through the volume, not laid on the paper: the medium is
				// already in the air the seal is about to move.
				z: SPAWN_HEIGHT + rng() * params.ceiling
			},
			velocity: { x: 0, y: 0, z: 0 },
			lifetimeS: SHIMMER_SIM.lifetimeS * (1 + (rng() * 2 - 1) * SHIMMER_SIM.lifetimeSpread)
		};
	},

	velocity(params, at, ageS): Vec3 {
		// R-01. A parcel draws inward while it is young, then hands the motion over
		// to the idle curl. `settleS` is the whole handover.
		const arriving = Math.max(0, 1 - ageS / params.settleS);
		const settled = 1 - arriving;
		// The medium hovers at its own height rather than resting on the paper.
		const hover = (params.ceiling - at.z) * params.wander;
		const radius = Math.hypot(at.x, at.y);
		if (radius < NEGLIGIBLE_DISTANCE) {
			return { x: 0, y: 0, z: hover };
		}
		const inward = -params.drift * arriving;
		// A standing curl read straight off the position: enough that the settled
		// medium never freezes, and no per-parcel state for the replay to carry.
		const curl = params.wander * settled;
		return {
			x: (at.x / radius) * inward + Math.sin(at.y * SHIMMER_SIM.curlScale) * curl,
			y: (at.y / radius) * inward - Math.sin(at.x * SHIMMER_SIM.curlScale) * curl,
			z: hover
		};
	},

	constrain(_params, parcel) {
		restOnSeal(parcel);
	}
};
