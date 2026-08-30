import type { CastEngine } from '$lib/cast/engine.js';
import { createCastEngine } from '$lib/cast/selectEngine.js';
import { castReadbackRequested } from '$lib/cast/stage/readback.js';
import { CONFIG } from '$lib/config.js';
import type { EffectStyle } from '$lib/structures/effectStyle.js';
import { emitMlDebug, ML_DEBUG_BUILD_ID } from '$lib/debug/mlDebug.js';
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
import {
	panAnchoredAtPointer,
	wheelDeltaPixels,
	zoomAfterWheel,
	type PanController
} from './pan-controller.svelte.js';
import {
	createSimulatorPlacementBehavior,
	resizeCursorForDirection,
	type ArrangeHover
} from './placement-behavior.svelte.js';
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
	#castEngine: CastEngine | null = null;
	#engineCanvas: HTMLCanvasElement | null = null;
	#engineStyle: EffectStyle | null = null;
	#keyboardHandler: ((event: KeyboardEvent) => void) | null = null;
	#attachedGlyphCanvas: HTMLCanvasElement | null = null;
	#pendingGlyphDetach: object | null = null;
	#captureReady = false;
	// Plain state on purpose: the cursor `$effect` reads it, and a rune here would
	// re-run that whole effect on every pointer move across a handle.
	#arrangeHover: ArrangeHover | null = null;
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
			onHoverChange: (hover) => {
				this.#arrangeHover = hover;
				this.#updateCanvasCursor();
			},
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
		const stopWatchingCanvasTransforms = this.#watchCanvasTransforms();
		const stopWheelGestures = this.#watchWheelGestures();

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
			stopWatchingCanvasTransforms();
			stopWheelGestures();
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

	/**
	 * Draws one frame of the cast onto the separate effect canvas. An active valid
	 * spell is a cast and nothing else: the user's `effectStyle` picks the engine,
	 * the spell never does, and there is no ownership flag and no fallback engine
	 * here. R-11 makes "manifests nothing" a look the cast paints. The seal guides
	 * are the glyph scene's (`sealGuidesEntity`).
	 *
	 * The effect canvas belongs to whichever engine is live, and a canvas that
	 * ever handed out a `2d` context can never host WebGL, so nothing else may
	 * draw on it and a style change mounts a fresh element (`{#key}` in
	 * `SimulatorCanvasPanel.svelte`). The `ctx` this receives is the glyph
	 * canvas's.
	 */
	renderCanvasFrame = (_ctx: CanvasRenderingContext2D, timestamp: number) => {
		const { recognition, ui } = this.#options;
		if (!ui.effectCanvas) {
			return;
		}

		if (
			!this.#castEngine ||
			this.#engineCanvas !== ui.effectCanvas ||
			this.#engineStyle !== ui.effectStyle
		) {
			this.#disposeCastEngine();
			// A fresh canvas arrives at its attribute size, and the sizing observer
			// only fires when the shell's box moves, so match the glyph canvas here.
			this.#matchEffectCanvasSize();
			this.#castEngine = createCastEngine(ui.effectCanvas, ui.effectStyle, {
				// Test-only and absent in production: a spec reading the effect canvas
				// back needs the frame to survive compositing (`stage/readback.ts`).
				preserveDrawingBuffer: castReadbackRequested(window.location.search)
			});
			this.#engineCanvas = ui.effectCanvas;
			this.#engineStyle = ui.effectStyle;
		}

		this.#castEngine.render(recognition.spellIR, recognition.ring, timestamp, {
			portalFit: ui.portalFit
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
		this.#disposeCastEngine();
	}

	/** Hand back whatever the engine held. The next frame builds one on what is mounted. */
	#disposeCastEngine() {
		this.#castEngine?.dispose();
		this.#castEngine = null;
		this.#engineCanvas = null;
		this.#engineStyle = null;
	}

	/** The two stacked canvases share one backing store size, always. */
	#matchEffectCanvasSize() {
		const { ui } = this.#options;
		const glyph = ui.glyphCanvas;
		if (!glyph || !ui.effectCanvas) {
			return;
		}
		if (ui.effectCanvas.width !== glyph.width || ui.effectCanvas.height !== glyph.height) {
			ui.effectCanvas.width = glyph.width;
			ui.effectCanvas.height = glyph.height;
		}
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
					recognition.scaleGeometry(scale);
				}
				recognition.clearPreviousRing();
				this.#updateCanvasCursor();
				recognition.scheduleRecompute(60);
			},
			onLayoutChange: ui.updateCanvasLayoutMode
		});
		this.#sizing.mount();
	}

	/**
	 * Rewrites the cursor once an eased canvas transform lands. The eraser ring is
	 * measured off the canvas as it stands on screen, and both a zoom step and the
	 * portal tilt animate that box, so a ring written while one is in flight is
	 * sized for a scale the canvas is only passing through. Both transitions bubble
	 * their transitionend up to the shell.
	 */
	#watchCanvasTransforms(): () => void {
		const shell = this.#options.ui.canvasShell;
		if (!shell) {
			return () => {};
		}

		const handleTransitionEnd = (event: TransitionEvent) => {
			if (event.propertyName === 'transform') {
				this.#updateCanvasCursor();
			}
		};
		shell.addEventListener('transitionend', handleTransitionEnd);
		return () => shell.removeEventListener('transitionend', handleTransitionEnd);
	}

	/**
	 * Wires the wheel to the same view transform the pan drag moves. The listener is
	 * non-passive because both branches take the gesture off the page, and a passive
	 * listener is not allowed to.
	 */
	#watchWheelGestures(): () => void {
		const shell = this.#options.ui.canvasShell;
		if (!shell) {
			return () => {};
		}
		shell.addEventListener('wheel', this.#handleWheel, { passive: false });
		return () => shell.removeEventListener('wheel', this.#handleWheel);
	}

	/**
	 * Ctrl or meta held is the zoom gesture, which is what a browser sends for a
	 * trackpad pinch. A plain wheel pans, so two-finger scrolling slides the paper
	 * the way it slides a page.
	 */
	#handleWheel = (event: WheelEvent) => {
		const { pan, ui } = this.#options;
		event.preventDefault();
		const deltaY = wheelDeltaPixels(event.deltaY, event.deltaMode);

		if (!event.ctrlKey && !event.metaKey) {
			pan.panBy(-wheelDeltaPixels(event.deltaX, event.deltaMode), -deltaY);
			return;
		}

		// The container scales about the centre of this box, so that centre is what
		// the anchoring correction is measured from.
		const box = ui.canvasShell.getBoundingClientRect();
		const zoom = ui.zoomLevel;
		ui.setZoom(zoomAfterWheel(zoom, deltaY));
		const anchored = panAnchoredAtPointer({
			panX: pan.panX,
			panY: pan.panY,
			zoom,
			nextZoom: ui.zoomLevel,
			pointerX: event.clientX,
			pointerY: event.clientY,
			centerX: box.left + box.width / 2,
			centerY: box.top + box.height / 2
		});
		pan.panTo(anchored.panX, anchored.panY);
	};

	#setupKeyboardShortcuts() {
		const { actions, drawing, shapeDrag, ui } = this.#options;

		this.#keyboardHandler = createSimulatorKeyboardHandler({
			activeTool: () => ui.activeTool,
			selectedPlacementId: () => drawing.selectedPlacementId,
			selectTool: (mode) => this.setCanvasMode(mode),
			nudgeSelected: actions.nudgeSelected,
			cancelArmedShape: shapeDrag.end,
			commitSelected: actions.commitSelected,
			deleteSelected: actions.removeSelectedShape,
			copySelected: actions.copySelected,
			paste: actions.paste,
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

		// Pan moves the view rather than the drawing, so it keeps working while a
		// sealed ring locks input.
		if (ui.canvasMode === 'pan') {
			ui.glyphCanvas.style.cursor = 'grab';
			return;
		}

		// Erasing is the way back out of a sealed ring, so it keeps its brush ring.
		if (ui.canvasMode === 'erase') {
			ui.glyphCanvas.style.cursor = eraserCursorCss(ui.glyphCanvas, CONFIG.eraser.radius);
			return;
		}

		if (recognition.summary.canvasLocked) {
			ui.glyphCanvas.style.cursor = 'not-allowed';
			return;
		}

		if (ui.canvasMode === 'arrange') {
			ui.glyphCanvas.style.cursor = this.#arrangeCursor();
			return;
		}

		ui.glyphCanvas.style.cursor = 'crosshair';
	}

	/**
	 * Arrange mode says what a drag will do through the cursor. The six handles
	 * render as identical dots, so the pointer is the only thing that tells them
	 * apart before you press.
	 */
	#arrangeCursor() {
		const hover = this.#arrangeHover;
		if (!hover) {
			return 'default';
		}
		if (hover.over === 'body') {
			return 'move';
		}
		if (hover.over === 'rotate') {
			return 'grab';
		}
		return resizeCursorForDirection(hover.dirX, hover.dirY);
	}
}
