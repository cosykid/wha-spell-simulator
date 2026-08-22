/**
 * @file The burst kernel: the strike's impulse ring.
 *
 * The one primitive whose kernel reads `ageS`. A burst is an event, not a flow:
 * every parcel carries its own decaying kick outward from where it was born, so
 * the ring thins as it travels instead of being pumped forever by a source that
 * has already fired.
 */

import { sampleAperture } from '../aperture.js';
import { NEGLIGIBLE_DISTANCE, softFalloff } from '../falloff.js';
import { restOnSeal, SPAWN_HEIGHT, type Primitive } from './primitive.js';
import type { BurstParams, Vec3 } from '../../../types.js';

const BURST_SIM = {
	/** Fraction of the ring speed a parcel is thrown with at birth. */
	spawnKick: 0.8,
	/** Seconds a burst parcel lives. Short: the strike is 320ms of the cast. */
	lifetimeS: 1.6,
	lifetimeSpread: 0.35
} as const;

/** The outward unit in the seal plane, or nothing at the exact center. */
function outwardAt(x: number, y: number): { x: number; y: number; radius: number } {
	const radius = Math.hypot(x, y);
	if (radius < NEGLIGIBLE_DISTANCE) {
		return { x: 0, y: 0, radius };
	}
	return { x: x / radius, y: y / radius, radius };
}

export const BURST: Primitive<BurstParams> = {
	kind: 'burst',

	spawn(params, aperture, rng) {
		const at = sampleAperture(aperture, rng);
		const outward = outwardAt(at.x, at.y);
		const kick = params.speed * BURST_SIM.spawnKick;
		return {
			at: { x: at.x, y: at.y, z: SPAWN_HEIGHT },
			velocity: { x: outward.x * kick, y: outward.y * kick, z: params.rise },
			lifetimeS: BURST_SIM.lifetimeS * (1 + (rng() * 2 - 1) * BURST_SIM.lifetimeSpread)
		};
	},

	velocity(params, at, ageS): Vec3 {
		// What is left of the impulse: `persistence` is the fraction still pushing
		// one second in, so the kick dies on its own schedule.
		const head = Math.pow(params.persistence, ageS);
		const spent = softFalloff(at.z, params.reach) * head;
		const outward = outwardAt(at.x, at.y);
		if (outward.radius < NEGLIGIBLE_DISTANCE) {
			return { x: 0, y: 0, z: params.rise * spent };
		}
		const rate = params.speed * softFalloff(outward.radius, params.reach) * head;
		return { x: outward.x * rate, y: outward.y * rate, z: params.rise * spent };
	},

	constrain(_params, parcel) {
		restOnSeal(parcel);
	}
};
