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
 * The finite core is the old field engine's radial magnitude: the draw
 * dies at the origin, so arriving matter pools against the seal instead of
 * spiking through a singularity.
 *
 * A twisted pull holds a hollow eye instead of a pool, and it is authored the
 * same way [`vortex.ts`](vortex.ts) authors its own: inside the eye the flow is
 * thrown back out, and nothing is born in there to begin with. The score sizes
 * the eye from the slant, so a straight pull passes through both terms with
 * `eye` at zero and keeps its pool.
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
	reach: 1.6,
	/** How hard the eye throws the medium back out, as a share of the swirl. */
	eyePush: 0.6,
	/** Nothing is born inside the eye, as a fraction of its radius. */
	spawnFloor: 1.05
} as const;

export const INTAKE: Primitive<IntakeParams> = {
	kind: 'intake',

	spawn(params, aperture, rng) {
		const at = sampleAperture(aperture, rng);
		const reached = { x: at.x * INTAKE_SIM.reach, y: at.y * INTAKE_SIM.reach };
		const arm = Math.hypot(reached.x, reached.y);
		// A parcel born in the eye would fill the hollow the twist exists to hold.
		const floor = params.eye * INTAKE_SIM.spawnFloor;
		const lift = arm < floor ? floor / Math.max(arm, NEGLIGIBLE_DISTANCE) : 1;
		const x = reached.x * lift;
		const y = reached.y * lift;
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
		// The hollow eye: inside it the flow is thrown back out, the way the funnel
		// in `vortex.ts` is a sheath around a calm center rather than a filled cone.
		const push =
			radius < params.eye
				? Math.abs(params.swirl) * INTAKE_SIM.eyePush * (1 - radius / params.eye)
				: 0;
		const radial = -params.draw * falloff + push;
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
