import { CONFIG } from '$lib/config.js';
import { emitMlDebug, ML_DEBUG_BUILD_ID } from '$lib/debug/mlDebug.js';
import { CanvasSizingController } from './canvas-sizing-controller.js';
import type { SimulatorDrawingActions } from './drawing-actions.js';
import type { SimulatorDrawingState } from './drawing-state.svelte.js';
import { eraserCursorCss } from './eraserCursor.js';
import { SimulatorInputControllers } from './input-controllers.js';
import { createSimulatorKeyboardHandler } from './keyboard.js';
import { locksFreehandInput, type CanvasMode, type CanvasTool } from './mode.js';
import type { PanController } from './pan-controller.svelte.js';
import type { RecognitionPipeline } from './recognition-pipeline.svelte.js';
import { SimulatorRenderLoop } from './render-loop.js';
import type { ShapeDragController } from './shape-drag-controller.svelte.js';
import type { SimulatorUiState } from './ui-state.svelte.js';

const STROKE_RECOGNITION_DEBOUNCE_MS = 120;

interface SimulatorRuntimeOptions {
	ui: SimulatorUiState;
	drawing: SimulatorDrawingState;
	recognition: RecognitionPipeline;
	actions: SimulatorDrawingActions;
	pan: PanController;
	shapeDrag: ShapeDragController;
}

/**
 * Owns mounted browser runtime services for the simulator.
 *
 * The session constructs long-lived state objects; this runtime attaches them to
 * DOM controllers, global listeners, resize observers, and the render loop.
 */
export class SimulatorRuntime {
	#input: SimulatorInputControllers | null = null;
	#sizing: CanvasSizingController | null = null;
	#renderLoop: SimulatorRenderLoop | null = null;
	#keyboardHandler: ((event: KeyboardEvent) => void) | null = null;
	readonly #options: SimulatorRuntimeOptions;

	constructor(options: SimulatorRuntimeOptions) {
		this.#options = options;

		$effect(() => {
			void this.#options.ui.zoomLevel;
			void this.#options.ui.canvasMode;
			void this.#options.recognition.summary.canvasLocked;

			this.setCaptureLocked(
				locksFreehandInput(
					this.#options.ui.canvasMode,
					this.#options.recognition.summary.canvasLocked
				)
			);
			this.#updateCanvasCursor();
		});
	}

	/** Starts all DOM-bound simulator services. */
	mount(): () => void {
		const { recognition, ui } = this.#options;

		ui.loadPreferences();
		recognition.refreshMlDebugEvents();
		const handleMlDebug = () => recognition.refreshMlDebugEvents();
		window.addEventListener('wha:ml-debug', handleMlDebug);
		this.#emitMountedDebugEvent();

		this.#setupInputControllers();
		this.#setupSizing();
		this.#setupRenderLoop();
		this.#setupKeyboardShortcuts();

		const dictionaryLoad = { cancelled: false };
		void this.#loadDictionary(dictionaryLoad);

		return () => {
			dictionaryLoad.cancelled = true;
			this.#renderLoop?.stop();
			recognition.dispose();
			this.#input?.disable();
			ui.inputReady = false;
			this.#options.shapeDrag.end();
			this.#options.pan.end();
			this.#sizing?.stop();
			if (this.#keyboardHandler) {
				window.removeEventListener('keydown', this.#keyboardHandler);
			}
			window.removeEventListener('wha:ml-debug', handleMlDebug);
		};
	}

	/** Applies a canvas mode and refreshes dependent controllers. */
	setCanvasMode(mode: CanvasMode) {
		const { drawing, recognition, shapeDrag, ui } = this.#options;

		ui.canvasMode = mode;
		this.#input?.setMode(mode);
		this.setCaptureLocked(locksFreehandInput(ui.canvasMode, recognition.summary.canvasLocked));
		this.#updateCanvasCursor();

		if (mode !== 'arrange') {
			shapeDrag.end();
			drawing.setSelected(null);
		}
		void recognition.recompute();
	}

	/** Applies a non-pan canvas tool mode. */
	setTool(tool: CanvasTool) {
		this.setCanvasMode(tool);
	}

	/** Locks or unlocks freehand capture, if input is mounted. */
	setCaptureLocked(locked: boolean) {
		this.#input?.setCaptureLocked(locked);
	}

	#emitMountedDebugEvent() {
		emitMlDebug(
			'page',
			'mounted',
			{
				buildId: ML_DEBUG_BUILD_ID,
				href: window.location.href,
				userAgent: navigator.userAgent,
				configDebug: CONFIG.recognition.ml.debug
			},
			CONFIG.recognition.ml.debug
		);
	}

	#setupInputControllers() {
		const { actions, drawing, recognition, shapeDrag, ui } = this.#options;

		this.#input = new SimulatorInputControllers({
			glyphCanvas: () => ui.glyphCanvas,
			store: drawing.store,
			placements: drawing.placements,
			getSelectedId: () => drawing.selectedPlacementId,
			setSelectedId: drawing.setSelected,
			hasArmedShape: () => shapeDrag.hasArmedShape(),
			placeArmedShape: shapeDrag.placeArmedShape,
			onStrokeStart: () => {
				recognition.cancelActiveRecognition();
				actions.dismissCanvasHint();
			},
			onStrokeCommit: () => {
				actions.pushHistory();
				recognition.refreshStrokes();
				recognition.scheduleRecompute(STROKE_RECOGNITION_DEBOUNCE_MS);
			},
			onPlacementChange: () => {
				if (drawing.selectedPlacementId) {
					drawing.setSelected(drawing.selectedPlacementId);
				}
				recognition.refreshStrokes();
			},
			onPlacementInteractionEnd: () => {
				actions.pushHistory();
				void recognition.recompute();
			},
			onEraseBegin: () => {
				recognition.cancelActiveRecognition();
				actions.dismissCanvasHint();
			},
			onEraseChange: () => {
				recognition.refreshStrokes();
			},
			onEraseCommit: (changed) => {
				if (changed) {
					actions.pushHistory();
				}
				void recognition.recompute();
			}
		});
		this.#input.mount(ui.canvasMode);
	}

	#setupSizing() {
		const { drawing, recognition, ui } = this.#options;

		this.#sizing = new CanvasSizingController({
			canvasShell: () => ui.canvasShell,
			glyphCanvas: () => ui.glyphCanvas,
			effectCanvas: () => ui.effectCanvas,
			workspace: () => ui.workspace,
			store: drawing.store,
			onCanvasScale: (scale) => {
				if (scale !== 1) {
					drawing.scalePlacements(scale, scale);
					drawing.history.scale(scale, scale);
				}
				recognition.clearPreviousRing();
				this.#updateCanvasCursor();
				recognition.scheduleRecompute(60);
			},
			onLayoutChange: ui.updateCanvasLayoutMode
		});
		this.#sizing.mount();
	}

	#setupRenderLoop() {
		const { drawing, recognition, ui } = this.#options;

		this.#renderLoop = new SimulatorRenderLoop({
			glyphCanvas: () => ui.glyphCanvas,
			effectCanvas: () => ui.effectCanvas,
			currentStroke: () => this.#input?.currentStroke() ?? null,
			strokes: () => recognition.strokes,
			pipeline: () => recognition.pipeline,
			spellIR: () => recognition.spellIR,
			ring: () => recognition.ring,
			showGuides: () => ui.showGuides,
			showDiagnostics: () => ui.showDiagnostics,
			selection: () => drawing.selectionHandles(ui.activeTool)
		});
		this.#renderLoop.start();
	}

	#setupKeyboardShortcuts() {
		const { actions, drawing, ui } = this.#options;

		this.#keyboardHandler = createSimulatorKeyboardHandler({
			activeTool: () => ui.activeTool,
			selectedPlacementId: () => drawing.selectedPlacementId,
			commitSelected: actions.commitSelected,
			deleteSelected: actions.removeSelectedShape,
			undo: actions.undo,
			redo: actions.redo
		});
		window.addEventListener('keydown', this.#keyboardHandler);
	}

	async #loadDictionary(loadState: { cancelled: boolean }) {
		const { drawing, recognition, ui } = this.#options;
		const loaded = await recognition.loadDictionary(loadState);
		if (!loaded || loadState.cancelled) {
			return;
		}
		this.#input?.enableCapture();
		drawing.resetHistory();
		ui.inputReady = true;
		void recognition.recompute();
	}

	#updateCanvasCursor() {
		const { recognition, ui } = this.#options;
		if (!ui.glyphCanvas) return;

		if (ui.canvasMode === 'pan') {
			ui.glyphCanvas.style.cursor = recognition.summary.canvasLocked ? 'not-allowed' : 'grab';
			return;
		}

		if (ui.canvasMode === 'arrange') {
			ui.glyphCanvas.style.cursor = 'default';
		} else if (ui.canvasMode === 'erase') {
			ui.glyphCanvas.style.cursor = eraserCursorCss(ui.glyphCanvas, CONFIG.eraser.radius);
		} else {
			ui.glyphCanvas.style.cursor = 'crosshair';
		}
	}
}
