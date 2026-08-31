import type { RingInfo, Stroke } from '$lib/types.js';

/**
 * Names the stroke that closed the casting ring.
 *
 * The seal is what casts a spell, so the way back into a finished diagram is to
 * take that closure back rather than to unlock it. The ring detector already
 * names the strokes its loop runs through, and freehand ink is the only thing
 * that can close one: a stamped ring template carries its own gap. Nothing can
 * be drawn after a seal either, so the most recent of those strokes is the one
 * that sealed the ring.
 *
 * @param strokes - Freehand strokes in draw order.
 * @param ring - The detected ring, which reports its own ink as `strokeIds`.
 * @returns The sealing stroke's id, or `null` when there is nothing to take back.
 *
 * @example
 * sealingStrokeId(strokes, recognition.ring) // -> 's4'
 */
export function sealingStrokeId(
	strokes: Stroke[],
	ring: RingInfo | null | undefined
): string | null {
	if (!ring?.found || !ring.complete) {
		return null;
	}

	const ringStrokeIds = new Set(ring.strokeIds ?? []);
	for (let index = strokes.length - 1; index >= 0; index -= 1) {
		const stroke = strokes[index];
		if (stroke && ringStrokeIds.has(stroke.id)) {
			return stroke.id;
		}
	}
	return null;
}
