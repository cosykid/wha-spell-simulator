/**
 * @file The pigment ramp. Named colours a painter would actually reach for, in
 * order of heat, and nothing luminous above amber.
 *
 * The warm near-white is the top of the ramp and only the hot-core subset is
 * allowed to reach it, so the column's brightness is a place inside the mass
 * rather than a property of every stroke.
 */

/** Soot to core, as sRGB triples in 0..1. */
const RAMP: ReadonlyArray<readonly [number, number, number]> = [
	[0.129, 0.09, 0.063], // soot
	[0.294, 0.137, 0.071], // burnt umber
	[0.49, 0.184, 0.071], // burnt sienna
	[0.722, 0.235, 0.09], // vermilion
	[0.851, 0.361, 0.106], // cinnabar
	[0.922, 0.573, 0.149], // amber
	[0.965, 0.776, 0.392], // pale amber
	[1.0, 0.949, 0.812] // core, warm near-white
];

/** How far up the ramp anything but the hot core may climb. */
export const MASS_CEILING = 0.82;

/** Cream the paper stand-in is painted in, so the page and the mesh agree. */
export const PAPER = '#e7dab4';
/** Ink the seal ring is drawn in. */
export const RING_INK = '#241b16';
/** The void the tilted paper recedes into. */
export const VOID = '#33291f';

/**
 * Samples the ramp. `heat` is clamped, so a caller may hand it an un-normalized
 * cooling term without guarding first.
 *
 * @example
 * pigment(0.82, out); // amber going pale
 */
export function pigment(heat: number, out: { r: number; g: number; b: number }): void {
	const t = (heat < 0 ? 0 : heat > 1 ? 1 : heat) * (RAMP.length - 1);
	const lo = Math.min(RAMP.length - 2, Math.floor(t));
	const f = t - lo;
	const a = RAMP[lo];
	const b = RAMP[lo + 1];
	out.r = a[0] + (b[0] - a[0]) * f;
	out.g = a[1] + (b[1] - a[1]) * f;
	out.b = a[2] + (b[2] - a[2]) * f;
}
