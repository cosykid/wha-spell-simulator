import { CONFIG } from '$lib/config.js';
import { DrawingCapture } from '$lib/input/drawingCapture.js';
import { EraserController } from '$lib/input/eraserController.js';
import { PlacementController } from '$lib/input/placementController.js';
import type { PlacementStore, StrokeStore, Vector } from '$lib/types.js';
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
	/** Editable placement store used by arrange mode. */
	placements: PlacementStore;
	/** Returns the currently selected placement id. */
	getSelectedId: () => string | null;
	/** Updates selection from placement-controller hit testing. */
	setSelectedId: (id: string | null) => void;
	/** Whether a palette shape is armed for click-to-place. */
	hasArmedShape: () => boolean;
	/** Places the currently armed palette shape on the canvas. */
	placeArmedShape: (point: Vector) => string | null;
	/** Fired when a freehand stroke begins. */
	onStrokeStart: () => void;
	/** Fired when a freehand stroke commits. */
	onStrokeCommit: () => void;
	/** Fired while an editable placement is being transformed. */
	onPlacementChange: () => void;
	/** Fired after a placement transform gesture ends. */
	onPlacementInteractionEnd: () => void;
	/** Fired when an erase gesture begins. */
	onEraseBegin: () => void;
	/** Fired after erase mutates the stroke store. */
	onEraseChange: () => void;
	/** Fired when an erase gesture ends, with whether ink changed. */
	onEraseCommit: (changed: boolean) => void;
}

/**
 * Mounts and coordinates the three pointer-input controllers used by the canvas:
 * freehand drawing, editable placement transforms, and erasing.
 */
export class SimulatorInputControllers {
	#capture: DrawingCapture | null = null;
	#placement: PlacementController | null = null;
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
			onCommit: this.#options.onStrokeCommit
		});
		this.#placement = new PlacementController(glyphCanvas, this.#options.placements, {
			getSelectedId: this.#options.getSelectedId,
			setSelectedId: this.#options.setSelectedId,
			hasArmedShape: this.#options.hasArmedShape,
			placeShape: this.#options.placeArmedShape,
			onChange: this.#options.onPlacementChange,
			onInteractionEnd: this.#options.onPlacementInteractionEnd
		});
		this.#placement.enable();
		this.#placement.setActive(mode === 'arrange');
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
		this.#placement?.disable();
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
		this.#placement?.setActive(mode === 'arrange');
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
