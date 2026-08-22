/**
 * @file The lab's two effect engines behind one contract, so the preview's frame
 * loop does not know which of them is drawing.
 *
 * `cast` is what the simulator ships since the phase 5 cutover. `field` is the
 * superseded engine, kept here (and as the lab default) until its deletion lands
 * so the two can still be compared side by side. Both own the same effect canvas
 * and both clear it, so switching is a matter of calling the other one next
 * frame.
 *
 * @example
 * const engines = createLabEngines(effectCanvas);
 * engines[engine].render(spellIR, ring, timestamp);
 */

import { CastRenderer } from '$lib/cast/render/castRenderer.js';
import { CONFIG } from '$lib/config.js';
import { resetParticleState } from '$lib/renderer/effects/effectUtils.js';
import { SpellEffectRenderer } from '$lib/renderer/spellEffectRenderer.js';
import type { RingInfo, SpellIR } from '$lib/types.js';

export type LabEngine = 'field' | 'cast';

export const LAB_ENGINES: readonly LabEngine[] = ['field', 'cast'];

/** The default, and what an unrecognized engine name falls back to. */
export const DEFAULT_LAB_ENGINE: LabEngine = 'field';

/** What the preview asks of an engine: draw this frame, and forget the cast in flight. */
export interface LabEffectEngine {
	render(spellIR: SpellIR, ring: RingInfo, timestamp: number): void;
	reset(): void;
}

/** Narrows an arbitrary string, so a URL parameter cannot select an engine that does not exist. */
export function labEngineFrom(value: string | null): LabEngine {
	return LAB_ENGINES.includes(value as LabEngine) ? (value as LabEngine) : DEFAULT_LAB_ENGINE;
}

export function createLabEngines(canvas: HTMLCanvasElement): Record<LabEngine, LabEffectEngine> {
	const field = new SpellEffectRenderer(canvas, CONFIG);
	const cast = new CastRenderer(canvas);

	return {
		field: {
			render: (spellIR, ring, timestamp) => field.render(spellIR, ring, timestamp),
			reset: () => {
				field.lastSignature = null;
				field.lastTime = null;
				resetParticleState(field.state);
			}
		},
		cast: {
			render: (spellIR, ring, timestamp) => cast.render(spellIR, ring, timestamp),
			reset: () => cast.reset()
		}
	};
}
