/**
 * @file How ink magnitude becomes loudness. Shared by every track builder so all
 * of them saturate the same way.
 *
 * Plan magnitudes are unbounded sums of drawn length, so a track cannot scale
 * with them linearly: a seal drawn twice as heavily would emit twice the parcels
 * and read as a bug. Every builder passes its magnitude through {@link saturate}
 * first, which maps `0..inf` onto `0..1` with a named half-way point.
 */

/**
 * Below this a plan component reads as absent rather than small, matching the
 * floor `compiler/plan/resolvePlan.ts` uses. Folding a dozen signs leaves
 * rounding dust in a cancelled component, and dust must not author a track.
 */
export const NEGLIGIBLE_INK = 1e-6;

/** 0 at no ink, 0.5 at `half`, approaching 1 from there. */
export function saturate(magnitude: number, half: number): number {
	const size = Math.abs(magnitude);
	return size <= 0 ? 0 : size / (size + half);
}

/**
 * Maps a 0..1 strength onto `[floor, 1]`, so the faintest spell is quiet rather
 * than motionless. Speeds use it; emission rates do not, because a track with no
 * ink behind it should emit nothing at all.
 */
export function aboveFloor(floor: number, strength: number): number {
	return floor + (1 - floor) * strength;
}
