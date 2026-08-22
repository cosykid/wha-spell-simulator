/**
 * @file The hold kernel: R-13's spring, levitation as a hover ceiling.
 *
 * The ceiling curve is the `buoyancy` case of `field/sampleField.ts` moved into
 * a kernel — lift fades linearly with altitude, so held magic settles into a
 * hovering mass instead of climbing away. Around that equilibrium the mass
 * gathers back onto the hover axis and keeps a slow bob, which is `ground-truth`
 * section 6's damped spring anchored at the hover locus.
 *
 * Two open canon questions are answered here as narrowly as possible and no
 * further. **Question 5** (column plus levitation: does drive beat grip?): the
 * grip takes only parcels that have effectively arrived, so a live jet passes
 * straight through it and only its spent parcels are caught. **Question 7**
 * (fill to capacity): nothing counts held mass, so the hold never stops.
 */

import { sampleAperture } from '../aperture.js';
import { NEGLIGIBLE_DISTANCE } from '../falloff.js';
import { restOnSeal, SPAWN_HEIGHT, type Primitive } from './primitive.js';
import { magnitude3 } from '../../vec3.js';
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
		// The hover ceiling, from FIELD_TUNING.hoverCeiling: lift fades with
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

	constrain(params, parcel) {
		restOnSeal(parcel);
		// Open canon question 5, least-committal: capture is soft. A parcel is
		// caught only once it has effectively arrived — past the band and no longer
		// being driven — so a column firing through a hold is not clipped mid-beam.
		// Open canon question 7 stays unanswered: nothing here counts held mass, so
		// the seal never fills and never stops.
		const top = ceilingTop(params);
		if (parcel.at.z <= top || magnitude3(parcel.velocity) > params.captureSpeed) {
			return;
		}
		parcel.at.z = top;
		parcel.velocity.z = 0;
	}
};
