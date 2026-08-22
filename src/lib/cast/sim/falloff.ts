/**
 * @file The two distance curves every kernel is built from, copied out of
 * `field/sampleField.ts` before that file is deleted at phase 5.
 *
 * Copied, not imported: the field's version reads a `SpellField` source and sums
 * over all of them, while a kernel is local by contract. Only the shapes carry
 * over.
 */

/** Below this two points are the same point, so there is no direction between them. */
export const NEGLIGIBLE_DISTANCE = 1e-6;

/**
 * Finite-core falloff, from `radialMagnitude` in `field/sampleField.ts`: zero at
 * the center, exactly 1 at `core`, then decaying slowly, so a radial kernel
 * keeps reaching past the ring without the center being a singularity.
 */
export function coreFalloff(distance: number, core: number): number {
	return (2 * core * distance) / (core * core + distance * distance);
}

/**
 * Soft footprint, from the `axial` and `directed` cases of
 * `field/sampleField.ts`: 1 at the center and half strength at `radius`, which
 * is what makes a column read as a column instead of a sheet.
 */
export function softFalloff(distance: number, radius: number): number {
	return 1 / (1 + (distance * distance) / (radius * radius));
}
