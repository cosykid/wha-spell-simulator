/**
 * @file The lab's effect engine, behind the one contract the preview's frame
 * loop calls: draw this frame, and forget the cast in flight.
 *
 * There is one engine. The field engine that used to sit beside it was deleted
 * in the redesign's phase 5, so the lab shows exactly what the simulator ships.
 *
 * @example
 * const engine = createLabEngine(effectCanvas);
 * engine.render(spellIR, ring, timestamp);
 */

import { CastRenderer } from '$lib/cast/render/castRenderer.js';
import type { RingInfo, SpellIR } from '$lib/types.js';

/** What the preview asks of the engine each frame. */
export interface LabEffectEngine {
	render(spellIR: SpellIR, ring: RingInfo, timestamp: number): void;
	reset(): void;
}

export function createLabEngine(canvas: HTMLCanvasElement): LabEffectEngine {
	const cast = new CastRenderer(canvas);
	return {
		render: (spellIR, ring, timestamp) => cast.render(spellIR, ring, timestamp),
		reset: () => cast.reset()
	};
}
