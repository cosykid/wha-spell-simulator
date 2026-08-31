import { CONFIG } from '$lib/config.js';
import { DrawingCapture } from '$lib/input/drawingCapture.js';
import { EraserController } from '$lib/input/eraserController.js';
import type { StrokeStore, Vector } from '$lib/types.js';
import { eraseSegment } from '$lib/utils/strokeErase.js';
import type { CanvasMode } from './mode.js';

/**
 * Callback surface between raw pointer controllers and the simulator session.
 *
 * The controller wrapper owns DOM listener lifecycle; the session owns domain
 * effects such as history pushes, recognition invalidation, and hint dismissal.
 */
interface SimulatorInputControllerOptions {
	/** Glyph canvas receiving pointer input. */
	glyphCanvas: () => HTMLCanvasElement;
	/** Freehand stroke store used by draw and erase tools. */
	store: StrokeStore;
	/** Fired when a freehand stroke begins. */
	onStrokeStart: () => void;
	/** Fired when a freehand stroke commits. */
	onStrokeCommit: () => void;
	/** Fired when a primary pointer lands while freehand capture is locked. */
	onLockedPointerDown: () => void;
	/** Fired when an erase gesture begins. */
	onEraseBegin: () => void;
	/** Fired after erase mutates the stroke store. */
	onEraseChange: () => void;
	/** Fired when an erase gesture ends, with whether ink changed. */
	onEraseCommit: (changed: boolean) => void;
}

/**
 * Mounts and coordinates pointer-input controllers for freehand drawing and erasing.
 *
 * Editable placement transforms are now handled by a Canvas API behavior in
 * `placement-behavior.svelte.ts`.
 */
export class SimulatorInputControllers {
	#capture: DrawingCapture | null = null;
	#eraser: EraserController | null = null;
	readonly #options: SimulatorInputControllerOptions;

	constructor(options: SimulatorInputControllerOptions) {
		this.#options = options;
	}

	/** Creates controllers and enables the one matching the initial canvas mode. */
	mount(mode: CanvasMode) {
		const glyphCanvas = this.#options.glyphCanvas();
		this.#capture = new DrawingCapture(glyphCanvas, this.#options.store, CONFIG, {
			onStart: this.#options.onStrokeStart,
			onCommit: this.#options.onStrokeCommit,
			onLockedPointerDown: this.#options.onLockedPointerDown
		});
		this.#eraser = new EraserController(glyphCanvas, {
			onBegin: this.#options.onEraseBegin,
			applyErase: (from, to) => this.#applyErase(from, to),
			onCommit: this.#options.onEraseCommit
		});
		this.#eraser.enable();
		this.#eraser.setActive(mode === 'erase');
	}

	/** Enables freehand capture after dictionary assets are ready. */
	enableCapture() {
		this.#capture?.enable();
	}

	/** Removes all pointer listeners owned by the input controllers. */
	disable() {
		this.#capture?.disable();
		this.#eraser?.disable();
	}

	/** Current in-progress freehand stroke, used by the render loop. */
	currentStroke() {
		return this.#capture?.getCurrentStrokeView() ?? null;
	}

	/** Locks or unlocks freehand drawing without disabling arrange/erase controllers. */
	setCaptureLocked(locked: boolean) {
		this.#capture?.setLocked(locked);
	}

	/** Switches arrange and erase controller activation for the current canvas mode. */
	setMode(mode: CanvasMode) {
		this.#eraser?.setActive(mode === 'erase');
	}

	#applyErase(from: Vector, to: Vector) {
		const result = eraseSegment(this.#options.store.peekStrokes(), from, to, CONFIG.eraser);
		if (!result.changed) {
			return false;
		}
		this.#options.store.load(result.strokes);
		this.#options.onEraseChange();
		return true;
	}
}
