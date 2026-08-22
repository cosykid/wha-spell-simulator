/**
 * @file The intake kernel: R-13's ambient coupling, the pull family drawing the
 * ambient medium toward the seal.
 *
 * `ground-truth` section 7 gives it three channels and one sign rule: a radial
 * sink, a lateral drag along the arrows, and a twist whose sense follows the
 * arrows' turn. `draw` is signed, so an outward-facing pull pushes the medium
 * away through the same kernel rather than through a second code path, exactly
 * as R-07 refuses a separate inverted column.
 *
 * The finite core is `radialMagnitude` from `field/sampleField.ts`: the draw
 * dies at the origin, so arriving matter pools against the seal instead of
 * spiking through a singularity.
 */

import { sampleAperture } from '../aperture.js';
import { coreFalloff, NEGLIGIBLE_DISTANCE } from '../falloff.js';
import { restOnSeal, SPAWN_HEIGHT, type Primitive } from './primitive.js';
import type { IntakeParams, Vec3 } from '../../../types.js';

const INTAKE_SIM = {
	/** Fraction of the draw a parcel arrives with. */
	spawnKick: 0.3,
	/** Seconds an ambient parcel lives. It has to cross the domain to read as inflow. */
	lifetimeS: 3.6,
	lifetimeSpread: 0.3,
	/**
	 * How far past its own valve the intake reaches for matter. Pull acts on the
	 * environment, not on what the seal emits (section 7), so its parcels start
	 * outside the aperture and stream in through it.
	 */
	reach: 1.6
} as const;

export const INTAKE: Primitive<IntakeParams> = {
	kind: 'intake',

	spawn(params, aperture, rng) {
		const at = sampleAperture(aperture, rng);
		const x = at.x * INTAKE_SIM.reach;
		const y = at.y * INTAKE_SIM.reach;
		const radius = Math.hypot(x, y);
		const kick = params.draw * INTAKE_SIM.spawnKick;
		const inward =
			radius < NEGLIGIBLE_DISTANCE ? { x: 0, y: 0 } : { x: -x / radius, y: -y / radius };
		return {
			at: { x, y, z: SPAWN_HEIGHT },
			velocity: { x: inward.x * kick, y: inward.y * kick, z: 0 },
			lifetimeS: INTAKE_SIM.lifetimeS * (1 + (rng() * 2 - 1) * INTAKE_SIM.lifetimeSpread)
		};
	},

	velocity(params, at, _ageS): Vec3 {
		// Only the twist lifts. A straight pull stays flat on the paper, which is
		// what canon's grasping wind reads as; the helical case is the slanted one.
		const rise = params.rise * Math.max(0, 1 - at.z / params.ceiling);
		const drag = { x: params.lateral.x * params.drift, y: params.lateral.y * params.drift };
		const radius = Math.hypot(at.x, at.y);
		if (radius < NEGLIGIBLE_DISTANCE) {
			return { x: drag.x, y: drag.y, z: rise };
		}
		const outward = { x: at.x / radius, y: at.y / radius };
		const tangential = { x: outward.y, y: -outward.x };
		const falloff = coreFalloff(radius, params.pool);
		const radial = -params.draw * falloff;
		const swirl = params.swirl * falloff;
		return {
			x: outward.x * radial + tangential.x * swirl + drag.x,
			y: outward.y * radial + tangential.y * swirl + drag.y,
			z: rise
		};
	},

	constrain(_params, parcel) {
		restOnSeal(parcel);
	}
};
