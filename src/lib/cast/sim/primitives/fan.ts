/**
 * @file The fan kernel: R-07's plane-hugging radial flow, with the swirl a
 * routed vortex leaves in it.
 *
 * The radial term and its finite core are salvaged from the `radial` case of
 * the deleted field engine; the vortex eye is deliberately left behind, because it
 * belongs to the real `vortex` primitive phase 4 builds. The ceiling is that
 * file's `hoverCeiling` shape: lift fades with altitude so a fan settles onto
 * the paper instead of climbing off it.
 */

import { sampleAperture } from '../aperture.js';
import { coreFalloff, NEGLIGIBLE_DISTANCE } from '../falloff.js';
import { restOnSeal, SPAWN_HEIGHT, type Primitive } from './primitive.js';
import type { FanParams, Vec3 } from '../../../types.js';

const FAN_SIM = {
	/** Fraction of the fan speed a parcel starts with. */
	spawnKick: 0.25,
	/** Seconds a fan parcel lives. Longer than a jet's: R-08's leak takes its time. */
	lifetimeS: 3.2,
	lifetimeSpread: 0.3
} as const;

export const FAN: Primitive<FanParams> = {
	kind: 'fan',

	spawn(params, aperture, rng) {
		const at = sampleAperture(aperture, rng);
		const radius = Math.hypot(at.x, at.y);
		const outward =
			radius < NEGLIGIBLE_DISTANCE ? { x: 0, y: 0 } : { x: at.x / radius, y: at.y / radius };
		const kick = params.speed * FAN_SIM.spawnKick;
		return {
			at: { x: at.x, y: at.y, z: SPAWN_HEIGHT },
			velocity: { x: outward.x * kick, y: outward.y * kick, z: 0 },
			lifetimeS: FAN_SIM.lifetimeS * (1 + (rng() * 2 - 1) * FAN_SIM.lifetimeSpread)
		};
	},

	velocity(params, at, _ageS): Vec3 {
		// Lift fades with altitude, so the fan hugs the plane it spreads across.
		const rise = params.rise * Math.max(0, 1 - at.z / params.ceiling);
		const radius = Math.hypot(at.x, at.y);
		if (radius < NEGLIGIBLE_DISTANCE) {
			return { x: 0, y: 0, z: rise };
		}
		const outward = { x: at.x / radius, y: at.y / radius };
		// Counter-clockwise as the drawer sees it, matching `columns.ts`: seal
		// space puts y screen-down, so a quarter turn maps (x, y) to (y, -x).
		const tangential = { x: outward.y, y: -outward.x };
		const falloff = coreFalloff(radius, params.core);
		const radialRate = params.speed * falloff;
		const swirlRate = params.swirl * falloff;
		return {
			x: outward.x * radialRate + tangential.x * swirlRate,
			y: outward.y * radialRate + tangential.y * swirlRate,
			z: rise
		};
	},

	constrain(_params, parcel) {
		restOnSeal(parcel);
	}
};
