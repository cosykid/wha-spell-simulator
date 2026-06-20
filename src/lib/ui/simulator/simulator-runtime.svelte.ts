import { CONFIG } from '$lib/config.js';
import { emitMlDebug, ML_DEBUG_BUILD_ID } from '$lib/debug/mlDebug.js';
import { SpellEffectRenderer } from '$lib/renderer/spellEffectRenderer.js';
import type { CanvasBehavior } from '$lib/ui/canvas/canvasBehavior.js';
import type { Scene } from '$lib/ui/canvas/scene.svelte.js';
import type { Attachment } from 'svelte/attachments';
import { CanvasSizingController } from './canvas-sizing-controller.js';
import type { SimulatorDrawingActions } from './drawing-actions.js';
import type { SimulatorDrawingState } from './drawing-state.svelte.js';
import { eraserCursorCss } from './eraserCursor.js';
import { createSimulatorGlyphScene } from './glyph-scene.svelte.js';
import { SimulatorInputControllers } from './input-controllers.js';
import { createSimulatorKeyboardHandler } from './keyboard.js';
import { locksFreehandInput, type CanvasMode, type CanvasTool } from './mode.js';
import type { PanController } from './pan-controller.svelte.js';
import { createSimulatorPlacementBehavior } from './placement-behavior.svelte.js';
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
	#effectRenderer: SpellEffectRenderer | null = null;
	#rendererEffectCanvas: HTMLCanvasElement | null = null;
	#keyboardHandler: ((event: KeyboardEvent) => void) | null = null;
	#attachedGlyphCanvas: HTMLCanvasElement | null = null;
	#pendingGlyphDetach: object | null = null;
	#captureReady = false;
	readonly #options: SimulatorRuntimeOptions;
	readonly #canvasBehavior: CanvasBehavior;
	readonly #placementBehavior: CanvasBehavior & { setActive(active: boolean): void };
	readonly #glyphScene: Scene;

	constructor(options: SimulatorRuntimeOptions) {
		this.#options = options;
		this.#glyphScene = createSimulatorGlyphScene({
			config: CONFIG,
			drawing: options.drawing,
			recognition: options.recognition,
			ui: options.ui,
			currentStroke: () => this.#input?.currentStroke() ?? null
		});
		this.#placementBehavior = createSimulatorPlacementBehavior({
			placements: options.drawing.placements,
			placementEntities: () => options.drawing.renderPlacementEntities(),
			getSelectedId: () => options.drawing.selectedPlacementId,
			setSelectedId: options.drawing.setSelected,
			hasArmedShape: () => options.shapeDrag.hasArmedShape(),
			placeArmedShape: options.shapeDrag.placeArmedShape,
			onChange: () => {
				if (options.drawing.selectedPlacementId) {
					options.drawing.setSelected(options.drawing.selectedPlacementId);
				}
			},
			onInteractionEnd: () => {
				options.actions.pushHistory();
				void options.recognition.recompute();
			}
		});
		this.#canvasBehavior = {
			attach: this.#attachCanvasBehaviors
		};

		// Keep the placement behavior's active state derived from `canvasMode` so it
		// stays correct no matter how the mode changed. Setting it only inside
		// `setCanvasMode` missed mode switches that bypass it (e.g. a persisted
		// `arrange` preference applied during `loadPreferences`), leaving arrange
		// mode visually active but its pointer handlers disabled.
		$effect(() => {
			void this.#options.ui.zoomLevel;
			void this.#options.ui.canvasMode;
			void this.#options.recognition.summary.canvasLocked;

			this.#placementBehavior.setActive(this.#options.ui.canvasMode === 'arrange');
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

	/** Canvas API scene that renders the simulator glyph canvas. */
	get glyphScene() {
		return this.#glyphScene;
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

	/** Draws one frame for the separate spell-effect canvas. */
	renderCanvasFrame = (_ctx: CanvasRenderingContext2D, timestamp: number) => {
		const { recognition, ui } = this.#options;
		if (!ui.effectCanvas) {
			return;
		}

		if (!this.#effectRenderer || this.#rendererEffectCanvas !== ui.effectCanvas) {
			this.#effectRenderer = new SpellEffectRenderer(ui.effectCanvas, CONFIG);
			this.#rendererEffectCanvas = ui.effectCanvas;
		}

		this.#effectRenderer.render(recognition.spellIR, recognition.ring, timestamp, {
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
		this.#placementBehavior.setActive(this.#options.ui.canvasMode === 'arrange');
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

	#attachCanvasBehaviors: Attachment<HTMLCanvasElement> = (canvas) => {
		const detachGlyphCanvas = this.#attachGlyphCanvas(canvas);
		const detachPlacements = this.#placementBehavior.attach(canvas);
		return () => {
			detachPlacements?.();
			detachGlyphCanvas?.();
		};
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
		this.#effectRenderer = null;
		this.#rendererEffectCanvas = null;
	}

	#setupInputControllers() {
		const { actions, drawing, recognition, ui } = this.#options;

		this.#input = new SimulatorInputControllers({
			glyphCanvas: () => ui.glyphCanvas,
			store: drawing.store,
			onStrokeStart: () => {
				recognition.cancelActiveRecognition();
				actions.dismissCanvasHint();
			},
			onStrokeCommit: () => {
				actions.pushHistory();
				recognition.refreshStrokes();
				recognition.scheduleRecompute(STROKE_RECOGNITION_DEBOUNCE_MS);
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
