import { toast } from '@zerodevx/svelte-toast';
import { deserializeSpellPreset, type SpellPresetData } from '$lib/structures/spellPreset.js';
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
 * How long a continuous transform edit coalesces before recognition runs. A
 * slider drag and a held arrow key change the shape many times a second, and a
 * full recognition per tick is work the next tick throws away. Matches the
 * debounce a committed stroke gets.
 */
const TRANSFORM_RECOGNITION_DEBOUNCE_MS = 120;

/**
 * How long after the last arrow press a nudge burst counts as finished. One
 * history entry covers the whole burst, so undo steps back over the nudge instead
 * of retracing it a pixel at a time.
 */
const NUDGE_BURST_MS = 400;

/**
 * User-facing drawing commands that mutate drawing state and keep recognition
 * in sync afterward.
 */
export class SimulatorDrawingActions {
	readonly #drawing: SimulatorDrawingState;
	readonly #recognition: RecognitionPipeline;
	readonly #ui: SimulatorUiState;
	#nudgeBurstTimer: ReturnType<typeof setTimeout> | null = null;

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

	/**
	 * Clears all drawing marks and reruns recognition.
	 *
	 * The wipe lands in undo history like any other edit, so the broom is
	 * reversible. The toast is the only place that says so.
	 */
	clear = () => {
		const hadMarks = this.#wipe();
		// An empty canvas is the step the first-use hint describes, so it comes back.
		this.#ui.resetCanvasHint();
		if (hadMarks) {
			toast.push('Canvas cleared - undo brings it back.');
		}
	};

	/**
	 * Tears a spent spell off for a fresh page.
	 *
	 * While a spell can still perform, erase and undo are the sealed page's only
	 * exits, which keeps the seal inviolable. A finished cast leaves dead paper,
	 * so it earns this third exit: a clear rather than an unlock. Unlike `clear`
	 * it leaves the first-use hint down, because the drawer who just finished a
	 * cast needs no tutorial.
	 */
	freshPage = () => {
		if (this.#wipe()) {
			toast.push('Fresh page - undo brings the spell back.');
		}
	};

	/**
	 * Empties the drawing and drops the spell state in the same tick, so the
	 * lock, tilt, and status never outlive the ink. Reports whether there was
	 * anything to wipe.
	 */
	#wipe(): boolean {
		const hadMarks = this.#drawing.store.count() > 0 || this.#drawing.placements.count() > 0;
		this.#drawing.clear();
		this.#recognition.resetSpellState();
		this.pushHistory();
		void this.#recognition.recompute();
		return hadMarks;
	}

	/** Converts the selected editable placement into permanent strokes. */
	commitSelected = () => {
		if (!this.#drawing.commitSelectedPlacement()) {
			return;
		}
		this.pushHistory();
		void this.#recognition.recompute();
	};

	/**
	 * Applies shape-inspector transform changes to the selected placement.
	 *
	 * The inspector fires one of these per slider tick, so recognition is scheduled
	 * rather than run. A discrete commit (a drag end, the end of a nudge burst) is
	 * what earns an immediate pass.
	 */
	updateSelectedTransform = (patch: Partial<PlacementTransform>) => {
		if (!this.#drawing.updateSelectedTransform(patch)) {
			return;
		}
		this.#recognition.scheduleRecompute(TRANSFORM_RECOGNITION_DEBOUNCE_MS);
	};

	/**
	 * Moves the selected placement by a canvas-pixel offset, for the arrow keys.
	 *
	 * A run of presses lands as a single history entry, so one undo takes back the
	 * whole nudge.
	 */
	nudgeSelected = (dx: number, dy: number) => {
		const transform = this.#drawing.selected?.transform;
		if (!transform) {
			return;
		}
		this.updateSelectedTransform({ cx: transform.cx + dx, cy: transform.cy + dy });
		this.#cancelNudgeBurst();
		this.#nudgeBurstTimer = setTimeout(this.#endNudgeBurst, NUDGE_BURST_MS);
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
		// Any nudge still waiting for its own entry is covered by this one, and a
		// second entry for the same state would make one undo look like a no-op.
		this.#cancelNudgeBurst();
		this.#drawing.pushHistory();
	};

	/**
	 * Replaces the canvas with a saved spell preset and reruns recognition. The
	 * previous drawing stays one undo away. Presets store an open ring, so the
	 * restored spell reads as prepared until the user seals it by hand.
	 *
	 * @returns `false` when the glyph canvas is not ready yet.
	 */
	loadPreset = (data: SpellPresetData): boolean => {
		const canvas = this.#ui.glyphCanvas;
		if (!canvas?.width) {
			return false;
		}
		const drawing = deserializeSpellPreset(data, canvas.width);
		this.#recognition.cancelActiveRecognition();
		this.#drawing.restore(drawing);
		this.#recognition.clearPreviousRing();
		this.pushHistory();
		void this.#recognition.recompute();
		this.dismissCanvasHint();
		return true;
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

	#endNudgeBurst = () => {
		this.pushHistory();
		void this.#recognition.recompute();
	};

	#cancelNudgeBurst() {
		if (this.#nudgeBurstTimer) {
			clearTimeout(this.#nudgeBurstTimer);
			this.#nudgeBurstTimer = null;
		}
	}
}
