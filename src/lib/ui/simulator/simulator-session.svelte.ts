import { GrimoireState } from '$lib/ui/spells/grimoire-state.svelte.js';
import { SimulatorDrawingActions } from './drawing-actions.js';
import { SimulatorDrawingState } from './drawing-state.svelte.js';
import { FirstSpellGuide } from './first-spell-guide.svelte.js';
import { PanController } from './pan-controller.svelte.js';
import { RecognitionPipeline } from './recognition-pipeline.svelte.js';
import { ShapeDragController } from './shape-drag-controller.svelte.js';
import { SimulatorRuntime } from './simulator-runtime.svelte.js';
import { SimulatorUiState } from './ui-state.svelte.js';

/**
 * Small route-facing facade for the simulator.
 *
 * It assembles the simulator subsystems and exposes the few cross-subsystem
 * commands the Svelte page needs. Runtime setup, drawing commands, recognition,
 * input controllers, panning, and UI state each live in their own modules.
 */
export class SimulatorSession {
	/** Bindable view and DOM state for the route. */
	readonly ui = new SimulatorUiState();
	/** Stroke, placement, selection, and history state. */
	readonly drawing = new SimulatorDrawingState();
	/** Recognition, spell summary, diagnostics, and shape-library state. */
	readonly recognition = new RecognitionPipeline({
		store: this.drawing.store,
		placements: this.drawing.placements,
		glyphCanvas: () => this.ui.glyphCanvas,
		mergedStrokes: () => this.drawing.mergedStrokes(),
		activeTool: () => this.ui.activeTool,
		showGuides: () => this.ui.showGuides,
		hintDismissed: () => this.ui.canvasHintDismissed,
		canUndo: () => this.drawing.canUndo,
		canRedo: () => this.drawing.canRedo,
		setInputLocked: (locked) => this.#runtime?.setCaptureLocked(locked)
	});
	/** High-level drawing commands exposed to panels and shortcuts. */
	readonly actions = new SimulatorDrawingActions({
		drawing: this.drawing,
		recognition: this.recognition,
		ui: this.ui
	});
	/** Canvas pan gesture state. */
	readonly pan = new PanController(() => this.ui.panEnabled);
	/** The user's saved spells, backing the My Spells tab and save dialog. */
	readonly grimoire = new GrimoireState();
	/** The first-spell guide: welcome card, ghost-traced walk, celebration. */
	readonly firstSpell = new FirstSpellGuide({
		ui: this.ui,
		recognition: this.recognition,
		actions: this.actions,
		hasMarks: () => this.drawing.store.count() > 0 || this.drawing.placements.count() > 0,
		selectDraw: () => this.handleSelectDraw()
	});
	/** Palette drag and armed-shape state. */
	readonly shapeDrag = new ShapeDragController({
		activeTool: () => this.ui.activeTool,
		setTool: (tool) => this.#runtime?.setTool(tool),
		canvasPointFromClient: (clientX, clientY) => this.#canvasPointFromClient(clientX, clientY),
		canvasRect: () => this.ui.glyphCanvas.getBoundingClientRect(),
		focusCanvasShell: () => this.ui.canvasShell.focus(),
		placeShape: (item, point) => this.actions.placeShape(item, point)
	});

	#runtime: SimulatorRuntime | null = null;

	constructor() {
		this.#runtime = new SimulatorRuntime({
			ui: this.ui,
			drawing: this.drawing,
			recognition: this.recognition,
			actions: this.actions,
			pan: this.pan,
			shapeDrag: this.shapeDrag,
			firstSpell: this.firstSpell
		});
	}

	/**
	 * Starts simulator runtime services after the route DOM has mounted.
	 *
	 * @returns Cleanup callback for Svelte `onMount`.
	 */
	mount(): () => void {
		return this.#runtime!.mount();
	}

	/** Canvas API controller used by the main glyph canvas. */
	get canvasController() {
		return this.#runtime!.canvasBehavior;
	}

	/** Canvas API scene used by the main glyph canvas. */
	get glyphScene() {
		return this.#runtime!.glyphScene;
	}

	/** Frame callback used by the glyph canvas loop to drive the separate effect canvas. */
	renderCanvasFrame = (ctx: CanvasRenderingContext2D, timestamp: number) => {
		this.#runtime?.renderCanvasFrame(ctx, timestamp);
	};

	/** Refreshes summary state after guide visibility changes. */
	handleToggleGuides = () => {
		this.recognition.refreshSummary();
	};

	/** Selects freehand draw mode (the pen tool). */
	handleSelectDraw = () => {
		this.#runtime?.setCanvasMode('draw');
	};

	/** Toggles arrange mode. */
	handleToggleArrange = () => {
		this.#runtime?.setCanvasMode(this.ui.toggleArrangeMode());
	};

	/** Toggles erase mode. */
	handleToggleEraser = () => {
		this.#runtime?.setCanvasMode(this.ui.toggleEraseMode());
	};

	/** Toggles pan mode. */
	handleTogglePan = () => {
		this.#runtime?.setCanvasMode(this.ui.togglePanMode());
	};

	#canvasPointFromClient(clientX: number, clientY: number) {
		const rect = this.ui.glyphCanvas.getBoundingClientRect();
		return {
			x: (clientX - rect.left) * (this.ui.glyphCanvas.width / rect.width),
			y: (clientY - rect.top) * (this.ui.glyphCanvas.height / rect.height)
		};
	}
}
