import { CONFIG } from '$lib/config.js';
import { emitMlDebug, ML_DEBUG_BUILD_ID } from '$lib/debug/mlDebug.js';
import { CanvasRenderer } from '$lib/renderer/canvasRenderer.js';
import type { CanvasBehavior } from '$lib/ui/canvas/canvasBehavior.js';
import type { Attachment } from 'svelte/attachments';
import { CanvasSizingController } from './canvas-sizing-controller.js';
import type { SimulatorDrawingActions } from './drawing-actions.js';
import type { SimulatorDrawingState } from './drawing-state.svelte.js';
import { eraserCursorCss } from './eraserCursor.js';
import { SimulatorInputControllers } from './input-controllers.js';
import { createSimulatorKeyboardHandler } from './keyboard.js';
import { locksFreehandInput, type CanvasMode, type CanvasTool } from './mode.js';
import type { PanController } from './pan-controller.svelte.js';
import type { RecognitionPipeline } from './recognition-pipeline.svelte.js';
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
	#renderer: CanvasRenderer | null = null;
	#rendererGlyphCanvas: HTMLCanvasElement | null = null;
	#rendererEffectCanvas: HTMLCanvasElement | null = null;
	#keyboardHandler: ((event: KeyboardEvent) => void) | null = null;
	#attachedGlyphCanvas: HTMLCanvasElement | null = null;
	#pendingGlyphDetach: object | null = null;
	#captureReady = false;
	readonly #options: SimulatorRuntimeOptions;
	readonly #canvasBehavior: CanvasBehavior;

	constructor(options: SimulatorRuntimeOptions) {
		this.#options = options;
		this.#canvasBehavior = {
			attach: this.#attachGlyphCanvas
		};

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

	/** Canvas API behavior that wires simulator pointer input to the glyph canvas. */
	get canvasBehavior() {
		return this.#canvasBehavior;
	}

	/** Starts all DOM-bound simulator services. */
	mount(): () => void {
		const { recognition, ui } = this.#options;

		ui.loadPreferences();
		recognition.refreshMlDebugEvents();
		const handleMlDebug = () => recognition.refreshMlDebugEvents();
		window.addEventListener('wha:ml-debug', handleMlDebug);
		this.#emitMountedDebugEvent();

		this.#setupSizing();
		this.#setupKeyboardShortcuts();

		const dictionaryLoad = { cancelled: false };
		void this.#loadDictionary(dictionaryLoad);

		return () => {
			dictionaryLoad.cancelled = true;
			recognition.dispose();
			this.#pendingGlyphDetach = null;
			this.#detachGlyphCanvas();
			ui.inputReady = false;
			this.#captureReady = false;
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

	/** Draws one Canvas API frame for glyph ink, overlays, and spell effects. */
	renderCanvasFrame = (ctx: CanvasRenderingContext2D, timestamp: number) => {
		const { drawing, recognition, ui } = this.#options;
		if (!ui.effectCanvas) {
			return;
		}

		const glyphCanvas = ctx.canvas;
		if (
			!this.#renderer ||
			this.#rendererGlyphCanvas !== glyphCanvas ||
			this.#rendererEffectCanvas !== ui.effectCanvas
		) {
			this.#renderer = new CanvasRenderer({
				glyphCanvas,
				effectCanvas: ui.effectCanvas,
				config: CONFIG
			});
			this.#rendererGlyphCanvas = glyphCanvas;
			this.#rendererEffectCanvas = ui.effectCanvas;
		}

		const pipeline = recognition.pipeline;
		const spellIR = recognition.spellIR;
		const strokes = recognition.strokes;

		this.#renderer.renderGlyph({
			strokes,
			currentStroke: this.#input?.currentStroke() ?? null,
			pipeline,
			showGuides: ui.showGuides,
			showDebug: ui.showDiagnostics,
			selection: drawing.selectionHandles(ui.activeTool)
		});

		if (spellIR?.active) {
			this.#renderer.renderActivatedGlyph({
				activatedAt: spellIR.activatedAt,
				duration: spellIR.duration,
				strokes,
				pipeline,
				timestamp
			});
		}

		this.#renderer.renderEffect({
			spellIR,
			ring: recognition.ring,
			timestamp,
			showGuides: ui.showGuides
		});
	};

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

	#attachGlyphCanvas: Attachment<HTMLCanvasElement> = (canvas) => {
		this.#pendingGlyphDetach = null;
		if (this.#attachedGlyphCanvas === canvas && this.#input) {
			return () => this.#scheduleGlyphCanvasDetach();
		}

		this.#detachGlyphCanvas();
		this.#attachedGlyphCanvas = canvas;
		this.#options.ui.glyphCanvas = canvas;
		this.#setupInputControllers();
		this.#input?.mount(this.#options.ui.canvasMode);
		if (this.#captureReady) {
			this.#input?.enableCapture();
		}
		this.setCaptureLocked(
			locksFreehandInput(
				this.#options.ui.canvasMode,
				this.#options.recognition.summary.canvasLocked
			)
		);
		this.#updateCanvasCursor();

		return () => this.#scheduleGlyphCanvasDetach();
	};

	#scheduleGlyphCanvasDetach() {
		const token = {};
		this.#pendingGlyphDetach = token;
		queueMicrotask(() => {
			if (this.#pendingGlyphDetach === token) {
				this.#pendingGlyphDetach = null;
				this.#detachGlyphCanvas();
			}
		});
	}

	#detachGlyphCanvas() {
		this.#input?.disable();
		this.#input = null;
		this.#attachedGlyphCanvas = null;
		this.#renderer = null;
		this.#rendererGlyphCanvas = null;
		this.#rendererEffectCanvas = null;
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
		this.#captureReady = true;
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
