/**
 * @file The distance curves every kernel is built from. The two falloffs are
 * copied out of the field engine before phase 5 deleted it;
 * `smoothstep` comes from `math2.ts` on branch `tc-field-canvas-rework`, where
 * the salvaged Rankine vortex windows its terms with it.
 *
 * Copied, not imported: the field's version read a force source and summed over
 * all of them, while a kernel is local by contract. Only the shapes carry over.
 */

/** Below this two points are the same point, so there is no direction between them. */
export const NEGLIGIBLE_DISTANCE = 1e-6;

/**
 * Finite-core falloff, from the field engine's radial magnitude: zero at
 * the center, exactly 1 at `core`, then decaying slowly, so a radial kernel
 * keeps reaching past the ring without the center being a singularity.
 */
export function coreFalloff(distance: number, core: number): number {
	return (2 * core * distance) / (core * core + distance * distance);
}

/**
 * Soft footprint, from the `axial` and `directed` cases of
 * the field engine: 1 at the center and half strength at `radius`, which
 * is what makes a column read as a column instead of a sheet.
 */
export function softFalloff(distance: number, radius: number): number {
	return 1 / (1 + (distance * distance) / (radius * radius));
}

/**
 * The Hermite ramp: 0 at or below `from`, 1 at or above `to`, smooth at both
 * ends. A vortex switches its updraft, floor inflow and crown spill on and off
 * with it, so no term turns on at a corner the eye can see.
 */
export function smoothstep(from: number, to: number, value: number): number {
	if (to === from) {
		return value < from ? 0 : 1;
	}
	const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
	return t * t * (3 - 2 * t);
}
