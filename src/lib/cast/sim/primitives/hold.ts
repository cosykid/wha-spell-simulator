/**
 * @file The hold kernel: R-13's spring, levitation as a hover ceiling.
 *
 * The ceiling curve is the deleted field engine's `buoyancy` case moved into
 * a kernel — lift fades linearly with altitude, so held magic settles into a
 * hovering mass instead of climbing away. Around that equilibrium the mass
 * gathers back onto the hover axis and keeps a slow bob, which is `ground-truth`
 * section 6's damped spring anchored at the hover locus.
 *
 * Two rulings live here. **R-18** (drive versus grip): the grip takes only
 * parcels that have effectively arrived, so a live jet passes straight through
 * it and only its spent parcels are caught. **R-20** (fill to capacity): held
 * parcels stop dissipating and the feed throttles against the mass in the blob,
 * so the seal fills and then stops manifesting.
 */

import { sampleAperture } from '../aperture.js';
import { NEGLIGIBLE_DISTANCE } from '../falloff.js';
import { restOnSeal, SPAWN_HEIGHT, type Primitive } from './primitive.js';
import { magnitude3 } from '../../vec3.js';
import type { Parcel } from '../parcel.js';
import type { HoldParams, Vec3 } from '../../../types.js';

const HOLD_SIM = {
	/** Fraction of the lift a parcel leaves the paper with. */
	spawnKick: 0.2,
	/** Seconds a held parcel lives. The longest of any primitive: a hold is patient. */
	lifetimeS: 4.2,
	lifetimeSpread: 0.25
} as const;

/** The top of the band the settled mass occupies, and the cap `constrain` enforces. */
function ceilingTop(params: HoldParams): number {
	return params.at.z + params.radius;
}

/**
 * Whether a parcel is in the ball. Section 6's blob plus the same margin again,
 * because `constrain` parks arrivals on the ceiling rather than inside the
 * sphere, and a parcel resting on the lid is as held as one churning under it.
 */
function inBlob(params: HoldParams, parcel: Parcel): boolean {
	const dx = parcel.at.x - params.at.x;
	const dy = parcel.at.y - params.at.y;
	const dz = parcel.at.z - params.at.z;
	return Math.hypot(dx, dy, dz) <= params.radius * 2;
}

export const HOLD: Primitive<HoldParams> = {
	kind: 'hold',

	spawn(params, aperture, rng) {
		const at = sampleAperture(aperture, rng);
		return {
			at: { x: at.x, y: at.y, z: SPAWN_HEIGHT },
			velocity: { x: 0, y: 0, z: params.lift * HOLD_SIM.spawnKick },
			lifetimeS: HOLD_SIM.lifetimeS * (1 + (rng() * 2 - 1) * HOLD_SIM.lifetimeSpread)
		};
	},

	velocity(params, at, ageS): Vec3 {
		// The hover ceiling, salvaged from the deleted field engine: lift fades with
		// altitude, so the equilibrium is a height rather than an escape.
		const ceiling = Math.max(params.at.z, NEGLIGIBLE_DISTANCE);
		const lift = params.lift * Math.max(0, 1 - at.z / ceiling);
		// The settled mass breathes. Amplitude is the blob radius, so the bob never
		// carries a parcel out of the band `constrain` caps it at.
		const bob = params.radius * params.bobRate * Math.cos(params.bobRate * ageS);

		const dx = at.x - params.at.x;
		const dy = at.y - params.at.y;
		const arm = Math.hypot(dx, dy);
		if (arm < NEGLIGIBLE_DISTANCE) {
			return { x: 0, y: 0, z: lift + bob };
		}
		// Section 6: the spring is off inside the blob radius, so the ball keeps
		// room to churn, and outside it displaced magic is drawn back to the axis.
		const displaced = Math.max(0, arm - params.radius);
		const gather = params.gather * displaced;
		const tangential = { x: dy / arm, y: -dx / arm };
		return {
			x: (-dx / arm) * gather + tangential.x * params.spin,
			y: (-dy / arm) * gather + tangential.y * params.spin,
			z: lift + bob
		};
	},

	constrain(params, parcel, stepS) {
		restOnSeal(parcel);
		// R-20: the grip sustains held magic, so a parcel in the ball does not age
		// out of it. Extending the lifetime rather than freezing the age keeps the
		// settled mass breathing, since the bob reads the same clock.
		if (inBlob(params, parcel)) {
			parcel.lifetimeS += stepS;
		}
		// R-18: capture is soft. A parcel is caught only once it has effectively
		// arrived — past the band and no longer being driven — so a column firing
		// through a hold is not clipped mid-beam.
		const top = ceilingTop(params);
		if (parcel.at.z <= top || magnitude3(parcel.velocity) > params.captureSpeed) {
			return;
		}
		parcel.at.z = top;
		parcel.velocity.z = 0;
	},

	/**
	 * R-20's valve. Section 6: the disk's feed accumulates in the ball, and once
	 * the held mass reaches `W_max` the seal stops manifesting. Held mass is every
	 * parcel in the blob whatever track threw it, so a column feeding a grip fills
	 * it too, which is section 6's recapture.
	 */
	throttle(params, parcels) {
		if (params.capacity <= 0) {
			return 1;
		}
		let held = 0;
		for (const parcel of parcels) {
			if (inBlob(params, parcel)) {
				held += 1;
			}
		}
		return Math.max(0, 1 - held / params.capacity);
	}
};
