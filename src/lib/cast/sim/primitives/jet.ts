/**
 * @file The jet kernel: an aimed column of flow along one axis.
 *
 * Salvaged from the deleted field engine's `axial` case, with the lean
 * removed. The old version offset the beam axis by the sign's own ring position;
 * R-05 says the beam goes where the ink points, and the score already put that
 * in `params.axis`, so the kernel needs no lean term of its own.
 */

import { sampleAperture } from '../aperture.js';
import { coreFalloff, NEGLIGIBLE_DISTANCE, softFalloff } from '../falloff.js';
import { SPAWN_HEIGHT, type Primitive } from './primitive.js';
import { dot3, scale3 } from '../../vec3.js';
import type { JetParams, Vec3 } from '../../../types.js';

const JET_SIM = {
	/** Fraction of the beam speed a parcel leaves the nozzle with. */
	spawnKick: 0.35,
	/** Seconds a jet parcel lives, before the per-parcel spread below. */
	lifetimeS: 2.4,
	/** Half-width of that spread, as a fraction of `lifetimeS`. */
	lifetimeSpread: 0.3
} as const;

export const JET: Primitive<JetParams> = {
	kind: 'jet',

	spawn(params, aperture, rng) {
		const at = sampleAperture(aperture, rng);
		return {
			at: { x: at.x, y: at.y, z: SPAWN_HEIGHT },
			velocity: scale3(params.axis, params.speed * JET_SIM.spawnKick),
			lifetimeS: JET_SIM.lifetimeS * (1 + (rng() * 2 - 1) * JET_SIM.lifetimeSpread)
		};
	},

	velocity(params, at, _ageS): Vec3 {
		const along = dot3(at, params.axis);
		// The offset from the beam axis, which is what the footprint measures.
		const offset = {
			x: at.x - params.axis.x * along,
			y: at.y - params.axis.y * along,
			z: at.z - params.axis.z * along
		};
		const offsetDistance = Math.hypot(offset.x, offset.y, offset.z);
		const beam = softFalloff(offsetDistance, params.footprint);
		// The beam spends itself downstream. The whole aperture is the nozzle, so
		// anything not yet past the seal center still gets the full push.
		const spent = softFalloff(Math.max(along, 0), params.reach);
		const push = scale3(params.axis, params.speed * beam * spent);

		if (offsetDistance < NEGLIGIBLE_DISTANCE) {
			return push;
		}
		// The chimney draft: surrounding parcels are gathered onto the axis.
		const draft =
			(coreFalloff(offsetDistance, params.footprint) * params.converge * params.speed) /
			offsetDistance;
		return {
			x: push.x - offset.x * draft,
			y: push.y - offset.y * draft,
			z: push.z - offset.z * draft
		};
	}
};
