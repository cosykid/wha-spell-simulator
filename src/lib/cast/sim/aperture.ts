/**
 * @file R-09's aperture as a spawn surface: which part of the seal disc a
 * primitive draws its parcels from.
 *
 * One sampler for all three primitives, so the valve is the same shape whatever
 * flows through it. The `sqrt` on every radius is salvaged from
 * the deleted field engine's spawn-domain sampler: it keeps parcels evenly
 * spread by area instead of piling up at the middle.
 *
 * @example
 * const at = sampleAperture({ kind: 'annulus', inner: 0.85, outer: 1.05 }, rng);
 */

import { vectorFromAngleDeg } from '../../utils/geometry.js';
import type { Aperture, Vector } from '../../types.js';
import type { Rng } from './rng.js';

const APERTURE_TUNING = {
	/** How much of the seal disc a bare `disc` emits from, from `SPAWN_RADII.anywhere`. */
	discRadius: 0.85,
	/** Half the length of a `band` along its own run, in seal units. */
	bandHalfLength: 1
} as const;

/** A point at `bearingDeg` and `radius`, in the bearing frame the plan layer writes. */
function polar(bearingDeg: number, radius: number): Vector {
	const direction = vectorFromAngleDeg(bearingDeg);
	return { x: direction.x * radius, y: direction.y * radius };
}

/** Uniform by area between two radii. */
function radiusBetween(inner: number, outer: number, u: number): number {
	return Math.sqrt(inner * inner + u * (outer * outer - inner * inner));
}

export function sampleAperture(aperture: Aperture, rng: Rng): Vector {
	switch (aperture.kind) {
		case 'point':
			return { x: aperture.at.x, y: aperture.at.y };
		case 'disc': {
			const at = polar(rng() * 360, APERTURE_TUNING.discRadius * Math.sqrt(rng()));
			const bias = aperture.bias;
			return bias ? { x: at.x + bias.x, y: at.y + bias.y } : at;
		}
		case 'annulus': {
			const arcDeg = aperture.arcDeg ?? 360;
			const bearingDeg = (aperture.bearingDeg ?? 0) + (rng() - 0.5) * arcDeg;
			return polar(bearingDeg, radiusBetween(aperture.inner, aperture.outer, rng()));
		}
		case 'sector': {
			const bearingDeg = aperture.bearingDeg + (rng() * 2 - 1) * aperture.halfAngleDeg;
			return polar(bearingDeg, radiusBetween(aperture.inner, aperture.outer, rng()));
		}
		case 'band': {
			// Across the band from its normal, along it from the perpendicular.
			const across = aperture.offset + (rng() - 0.5) * aperture.width;
			const along = (rng() * 2 - 1) * APERTURE_TUNING.bandHalfLength;
			const normal = aperture.normal;
			return {
				x: normal.x * across - normal.y * along,
				y: normal.y * across + normal.x * along
			};
		}
	}
}
