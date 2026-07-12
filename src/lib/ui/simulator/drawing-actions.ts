import type { PlacementTransform, ShapeItem, Vector } from '$lib/types.js';
import type { SimulatorDrawingState } from './drawing-state.svelte.js';
import type { RecognitionPipeline } from './recognition-pipeline.svelte.js';
import type { SimulatorUiState } from './ui-state.svelte.js';

interface SimulatorDrawingActionsOptions {
	drawing: SimulatorDrawingState;
	recognition: RecognitionPipeline;
	ui: SimulatorUiState;
}

/**
 * User-facing drawing commands that mutate drawing state and keep recognition
 * in sync afterward.
 */
export class SimulatorDrawingActions {
	readonly #drawing: SimulatorDrawingState;
	readonly #recognition: RecognitionPipeline;
	readonly #ui: SimulatorUiState;

	constructor(options: SimulatorDrawingActionsOptions) {
		this.#drawing = options.drawing;
		this.#recognition = options.recognition;
		this.#ui = options.ui;
	}

	/** Restores the previous drawing snapshot and reruns recognition. */
	undo = () => {
		const snap = this.#drawing.undo();
		if (!snap) {
			return;
		}
		this.#recognition.cancelActiveRecognition();
		this.#drawing.restore(snap);
		this.#recognition.clearPreviousRing();
		void this.#recognition.recompute();
	};

	/** Restores the next drawing snapshot and reruns recognition. */
	redo = () => {
		const snap = this.#drawing.redo();
		if (!snap) {
			return;
		}
		this.#recognition.cancelActiveRecognition();
		this.#drawing.restore(snap);
		this.#recognition.clearPreviousRing();
		void this.#recognition.recompute();
	};

	/** Clears all drawing marks and reruns recognition. */
	clear = () => {
		this.#recognition.cancelActiveRecognition();
		this.#drawing.clear();
		this.#recognition.clearPreviousRing();
		this.pushHistory();
		void this.#recognition.recompute();
	};

	/** Converts the selected editable placement into permanent strokes. */
	commitSelected = () => {
		if (!this.#drawing.commitSelectedPlacement()) {
			return;
		}
		this.pushHistory();
		void this.#recognition.recompute();
	};

	/** Applies shape-inspector transform changes to the selected placement. */
	updateSelectedTransform = (patch: Partial<PlacementTransform>) => {
		if (!this.#drawing.updateSelectedTransform(patch)) {
			return;
		}
		void this.#recognition.recompute();
	};

	/** Removes the selected editable placement. */
	removeSelectedShape = () => {
		if (!this.#drawing.deleteSelectedPlacement()) {
			return;
		}
		this.pushHistory();
		void this.#recognition.recompute();
	};

	/**
	 * Copies the selected placement so it can be pasted as a new shape.
	 *
	 * Copying does not change the drawing, so it neither records history nor
	 * reruns recognition.
	 */
	copySelected = () => this.#drawing.copySelectedPlacement();

	/**
	 * Pastes the last copied placement as a new selected shape and reruns
	 * recognition.
	 *
	 * @returns `true` when a copy was pasted.
	 */
	paste = () => {
		if (this.#drawing.pastePlacement() === null) {
			return false;
		}
		this.pushHistory();
		void this.#recognition.recompute();
		return true;
	};

	/** Records the current drawing state in undo history. */
	pushHistory = () => {
		this.#drawing.pushHistory();
	};

	/**
	 * Places a palette item as an editable shape and reruns recognition.
	 *
	 * @returns The new placement id.
	 */
	placeShape(item: ShapeItem, point: Vector) {
		this.dismissCanvasHint();
		const id = this.#drawing.placeShape(item, point, this.#ui.glyphCanvas);
		this.pushHistory();
		void this.#recognition.recompute();
		return id;
	}

	/** Dismisses the first-use hint in both UI and summary state. */
	dismissCanvasHint() {
		if (this.#ui.dismissCanvasHint()) {
			this.#recognition.hideHint();
		}
	}
}
