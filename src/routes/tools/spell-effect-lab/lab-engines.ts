/**
 * @file The lab's effect engines, behind the one contract the preview's frame
 * loop calls: draw this frame, and forget the cast in flight.
 *
 * The app ships one engine and the no-second-engine law stands. Since the
 * cutover (`docs/animation-cells.md` step 4) that engine is the cell stage, here
 * and at the other two call sites alike. The `cast` entry below is the 2D
 * renderer it replaced, reachable **only here and only by URL**, so the two can
 * still be looked at side by side while the deletion in step 5 is pending.
 *
 * @example
 * const engine = createLabEngine(effectCanvas, { id: readLabEngineId(page.url) });
 * engine.render(spellIR, ring, timestamp);
 */

import { CastRenderer } from '$lib/cast/render/castRenderer.js';
import { CastStage } from '$lib/cast/stage/stage.js';
import type { RingInfo, SpellIR } from '$lib/types.js';

/** What the preview asks of the engine each frame. */
export interface LabEffectEngine {
	render(spellIR: SpellIR, ring: RingInfo, timestamp: number): void;
	reset(): void;
}

/** `stage` is the shipped cell stage; `cast` is the 2D renderer it replaced. */
export type LabEngineId = 'cast' | 'stage';

export const DEFAULT_LAB_ENGINE: LabEngineId = 'stage';

export interface LabEngineOptions {
	id?: LabEngineId;
	/**
	 * The `?frameMs=` path renders once and stops, so the stage has to keep its
	 * drawing buffer for a screenshot to find anything in it.
	 */
	scriptedClock?: boolean;
}

/** The engine this URL asks for. Anything unrecognized falls to the shipped one. */
export function readLabEngineId(url: URL): LabEngineId {
	return url.searchParams.get('engine') === 'cast' ? 'cast' : DEFAULT_LAB_ENGINE;
}

export function createLabEngine(
	canvas: HTMLCanvasElement,
	options: LabEngineOptions = {}
): LabEffectEngine {
	if ((options.id ?? DEFAULT_LAB_ENGINE) === 'stage') {
		const stage = new CastStage(canvas, { preserveDrawingBuffer: options.scriptedClock });
		return {
			render: (spellIR, ring, timestamp) => stage.render(spellIR, ring, timestamp),
			reset: () => stage.reset()
		};
	}
	const cast = new CastRenderer(canvas);
	return {
		render: (spellIR, ring, timestamp) => cast.render(spellIR, ring, timestamp),
		reset: () => cast.reset()
	};
}
