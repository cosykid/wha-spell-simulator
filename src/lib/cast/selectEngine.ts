/**
 * @file The one place an `EffectStyle` becomes an engine. A host asks for the
 * style the user chose and gets a {@link CastEngine} back; nothing anywhere
 * reads a `SpellIR` to pick one.
 *
 * @example
 * const engine = createCastEngine(canvas, ui.effectStyle, { preserveDrawingBuffer });
 */

import { ClassicCast } from './classic/classicCast.js';
import { CastStage } from './stage/stage.js';
import type { CastEngine } from './engine.js';
import type { EffectStyle } from '../structures/effectStyle.js';

export interface CreateCastEngineOptions {
	/**
	 * Keep the last frame readable, for the scripted-clock path only. The stage's
	 * drawing buffer is thrown away at composite without it; a 2D canvas is always
	 * readable, so classic ignores it.
	 */
	preserveDrawingBuffer?: boolean;
}

/**
 * Builds the engine this style names, over this canvas.
 *
 * A canvas that has handed out a `2d` context can never return a WebGL one, and
 * the failure is silent and permanent, so a host changes style by mounting a
 * fresh canvas and building against that — never by handing this one an element
 * the other style already used.
 */
export function createCastEngine(
	canvas: HTMLCanvasElement,
	style: EffectStyle,
	options: CreateCastEngineOptions = {}
): CastEngine {
	return style === 'classic'
		? new ClassicCast(canvas)
		: new CastStage(canvas, { preserveDrawingBuffer: options.preserveDrawingBuffer });
}
