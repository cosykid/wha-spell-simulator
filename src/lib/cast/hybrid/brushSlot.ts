/**
 * @file Which cell of the brush atlas a mark is stamped from, and where that
 * cell sits in uv.
 *
 * Split out from the atlas itself because a mark decides its slot on the CPU and
 * the golden tier performs a whole cast in plain Node, where there is no canvas
 * to paint an atlas on.
 */

/** Atlas cell, in the order the stamps are painted. */
export const BRUSH_SLOT = {
	streak: 0,
	lick: 1,
	wash: 2,
	soot: 3
} as const;

export type BrushSlot = (typeof BRUSH_SLOT)[keyof typeof BRUSH_SLOT];

/** The uv rect of a slot, optionally mirrored: `[u0, v0, u1, v1]`. */
export function slotUv(slot: BrushSlot, flip: number): [number, number, number, number] {
	const u0 = (slot % 2) * 0.5;
	const v0 = slot < 2 ? 0.5 : 0;
	const u = flip & 1 ? [u0 + 0.5, u0] : [u0, u0 + 0.5];
	const v = flip & 2 ? [v0 + 0.5, v0] : [v0, v0 + 0.5];
	return [u[0], v[0], u[1], v[1]];
}
