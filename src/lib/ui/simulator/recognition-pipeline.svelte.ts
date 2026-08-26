import { carrySpellActivation, compileSpell } from '$lib/compiler/spellBuilder.js';
import { CONFIG } from '$lib/config.js';
import {
	emitMlDebug,
	mlDebugEnabled as isMlDebugEnabled,
	mlDebugEventsSnapshot,
	type MlDebugEvent
} from '$lib/debug/mlDebug.js';
import { loadDictionary } from '$lib/dictionary/dictionaryLoader.js';
import { buildShapeLibrary } from '$lib/input/shapeLibrary.js';
import {
	classifyDrawingOffThread,
	disposeDrawingClassifierClient,
	isDrawingClassifierSuperseded,
	warmDrawingClassifierWorker
} from '$lib/parser/drawingClassifierClient.js';
import type {
	ClassifiedDrawing,
	Dictionary,
	PlacementStore,
	RingInfo,
	ShapeLibrary,
	SpellIR,
	Stroke,
	StrokeStore
} from '$lib/types.js';
import { computeSummary, INITIAL_SUMMARY, type SpellSummary } from '$lib/ui/spellSummary.js';
import { buildSimulatorDiagnostics } from './diagnostics.js';
import { visibleCanvasShortAxis } from './layout.js';
import type { CanvasTool } from './mode.js';
import type { SimulatorDiagnostics } from './types.js';

/**
 * Dependencies supplied by the simulator session to keep recognition independent
 * from the route and canvas-controller implementation.
 */
interface RecognitionPipelineOptions {
	/** Store of freehand strokes, used by summary derivation. */
	store: StrokeStore;
	/** Editable placements, used by summary derivation. */
	placements: PlacementStore;
	/** Current glyph canvas, needed for classifier dimensions. */
	glyphCanvas: () => HTMLCanvasElement;
	/** Complete stroke set, including baked previews of editable placements. */
	mergedStrokes: () => Stroke[];
	/** Active canvas tool, used to derive summary mode flags. */
	activeTool: () => CanvasTool;
	/** Whether guide overlays and guide-driven hints are enabled. */
	showGuides: () => boolean;
	/** Whether the user has permanently dismissed the starter canvas hint. */
	hintDismissed: () => boolean;
	/** Whether undo is currently available. */
	canUndo: () => boolean;
	/** Whether redo is currently available. */
	canRedo: () => boolean;
	/** Updates the drawing controller lock after recognition changes input state. */
	setInputLocked: (locked: boolean) => void;
}

/**
 * Runs dictionary loading, off-thread drawing classification, spell compilation,
 * summary derivation, and diagnostic assembly for the simulator.
 *
 * The session owns user interactions; this pipeline owns the expensive async
 * recognition work and guards against stale classifier responses.
 */
export class RecognitionPipeline {
	/** Loaded spell dictionary, exposed to the sidebar. */
	dictionary = $state<Dictionary | null>(null);
	/** User-facing spell state summary. */
	summary = $state<SpellSummary>({ ...INITIAL_SUMMARY });
	/** True while a recompute is pending or in flight, until its result applies. */
	recognizing = $state(false);
	/** Diagnostics tree displayed in the sidebar. */
	diagnostics = $state<SimulatorDiagnostics>({
		ast: null,
		ir: null,
		parser: null,
		ml: null
	});
	/** Palette-ready shape library built from the dictionary. */
	shapeLibrary = $state<ShapeLibrary | null>(null);

	/** Snapshot of ML debug events mirrored from the debug event bus. */
	mlDebugEvents = $state<MlDebugEvent[]>([]);

	#strokes: Stroke[] = [];
	#pipeline: ClassifiedDrawing | null = null;
	#spellIR: SpellIR | null = null;
	#previousRing: RingInfo | null = null;
	#dictionarySnapshot: Dictionary | null = null;
	#recomputeTimer: ReturnType<typeof setTimeout> | null = null;
	#recomputeSeq = 0;
	readonly #options: RecognitionPipelineOptions;

	constructor(options: RecognitionPipelineOptions) {
		this.#options = options;
	}

	/** Last stroke set submitted to recognition/rendering. */
	get strokes() {
		return this.#strokes;
	}

	/** Latest classified drawing pipeline result. */
	get pipeline() {
		return this.#pipeline;
	}

	/** Latest compiled spell IR. */
	get spellIR() {
		return this.#spellIR;
	}

	/** Latest detected ring, if classification has completed. */
	get ring() {
		return this.#pipeline?.ring;
	}

	/**
	 * Loads dictionary assets and warms the classifier worker.
	 *
	 * @returns `true` when loading completed before the caller cancelled.
	 */
	async loadDictionary(loadState: { cancelled: boolean }) {
		try {
			this.dictionary = await loadDictionary();
			if (loadState.cancelled) {
				return false;
			}
			this.#dictionarySnapshot = $state.snapshot(this.dictionary) as Dictionary;
			warmDrawingClassifierWorker(this.#dictionarySnapshot, CONFIG);
			this.shapeLibrary = buildShapeLibrary(this.dictionary);
			return true;
		} catch (error) {
			console.error(error);
			this.summary = {
				...this.summary,
				statusText: 'Dictionary load failed',
				statusClass: 'invalid'
			};
			return false;
		}
	}

	/** Refreshes ML debug state and rebuilds diagnostics. */
	refreshMlDebugEvents() {
		this.mlDebugEvents = mlDebugEventsSnapshot();
		this.diagnostics = this.#buildDiagnostics();
	}

	/** Rebuilds the current stroke snapshot from session drawing state. */
	refreshStrokes() {
		this.#strokes = this.#options.mergedStrokes();
	}

	/** Clears ring continuity state after undo, clear, or canvas resize. */
	clearPreviousRing() {
		this.#previousRing = null;
	}

	/** Recomputes summary-only state without rerunning recognition. */
	refreshSummary() {
		if (this.dictionary) {
			this.summary = this.#computeSummary();
		}
	}

	/** Hides the introductory canvas hint in the summary model. */
	hideHint() {
		this.summary = { ...this.summary, hintHidden: true };
	}

	/** Cancels a delayed recompute that has not started yet. */
	cancelScheduledRecompute() {
		if (this.#recomputeTimer) {
			clearTimeout(this.#recomputeTimer);
			this.#recomputeTimer = null;
		}
	}

	/** Invalidates pending or in-flight recognition so stale results cannot apply. */
	cancelActiveRecognition() {
		this.cancelScheduledRecompute();
		this.#recomputeSeq += 1;
		// Nothing can apply a result anymore, so the reading state must not stick.
		this.#setRecognizing(false);
	}

	/** Schedules recognition after a short debounce window. */
	scheduleRecompute(delay: number) {
		this.cancelScheduledRecompute();
		this.#setRecognizing(true);
		this.#recomputeTimer = setTimeout(() => {
			this.#recomputeTimer = null;
			void this.recompute();
		}, delay);
	}

	/**
	 * Runs classification and spell compilation for the current drawing.
	 *
	 * Recognition is async and guarded by a sequence number so rapid edits cannot
	 * apply older classifier results over newer canvas state.
	 */
	async recompute() {
		if (!this.dictionary || !this.#dictionarySnapshot) {
			// A scheduled recompute can fire before assets finish loading. No result
			// will ever apply for it, so drop the reading state.
			this.#setRecognizing(false);
			return;
		}

		this.#setRecognizing(true);
		this.refreshStrokes();
		const seq = ++this.#recomputeSeq;
		let result: ClassifiedDrawing;
		const glyphCanvas = this.#options.glyphCanvas();
		const guideReferenceSize = visibleCanvasShortAxis(glyphCanvas);
		this.#mlDebugLog('recompute starting', {
			strokes: this.#strokes.length,
			previousRingFound: this.#previousRing?.found ?? false,
			canvasWidth: glyphCanvas.width,
			canvasHeight: glyphCanvas.height,
			guideReferenceSize
		});
		try {
			result = await classifyDrawingOffThread(
				{
					strokes: this.#strokes,
					previousRing: this.#previousRing,
					canvasWidth: glyphCanvas.width,
					canvasHeight: glyphCanvas.height,
					guideReferenceSize,
					dictionary: this.#dictionarySnapshot,
					config: CONFIG
				},
				(mlResult) => this.#applyClassifiedDrawing(mlResult, seq)
			);
		} catch (error) {
			if (isDrawingClassifierSuperseded(error)) {
				return;
			}
			// Only the recompute that still owns the sequence may clear the reading
			// state. Clearing from a stale one would hide its replacement's indicator.
			if (seq === this.#recomputeSeq) {
				this.#setRecognizing(false);
			}
			console.error(error);
			return;
		}
		this.#applyClassifiedDrawing(result, seq);
	}

	/** Stops pending recognition timers and disposes classifier worker clients. */
	dispose() {
		this.cancelScheduledRecompute();
		disposeDrawingClassifierClient();
	}

	#applyClassifiedDrawing(result: ClassifiedDrawing, seq: number) {
		if (seq !== this.#recomputeSeq) {
			return;
		}

		// Direct write instead of #setRecognizing: the summary rebuild below
		// already picks up the cleared flag.
		this.recognizing = false;
		this.#pipeline = result;
		this.#previousRing = this.#pipeline.ring;
		this.#spellIR = carrySpellActivation(
			this.#spellIR,
			compileSpell({ glyphAST: this.#pipeline.glyphAST, config: CONFIG })
		);
		this.summary = this.#computeSummary();
		this.#options.setInputLocked(this.summary.inputLocked);
		this.diagnostics = this.#buildDiagnostics();
	}

	/** Flips the in-flight flag and refreshes the summary so the status line tracks it. */
	#setRecognizing(recognizing: boolean) {
		if (this.recognizing === recognizing) {
			return;
		}
		this.recognizing = recognizing;
		this.refreshSummary();
	}

	#computeSummary() {
		return computeSummary({
			store: this.#options.store,
			pipeline: this.#pipeline,
			spellIR: this.#spellIR,
			showGuides: this.#options.showGuides(),
			arrangeMode: this.#options.activeTool() === 'arrange',
			eraseMode: this.#options.activeTool() === 'erase',
			placementCount: this.#options.placements.count(),
			hintDismissed: this.#options.hintDismissed(),
			canUndo: this.#options.canUndo(),
			canRedo: this.#options.canRedo(),
			recognizing: this.recognizing
		});
	}

	#buildDiagnostics() {
		return buildSimulatorDiagnostics({
			rawStrokes: this.#strokes,
			pipeline: this.#pipeline,
			spellIR: this.#spellIR,
			mlDebugEnabled: this.#mlDebugEnabled(),
			mlDebugEvents: this.mlDebugEvents
		});
	}

	#mlDebugEnabled() {
		return isMlDebugEnabled(CONFIG.recognition.ml.debug);
	}

	#mlDebugLog(message: string, detail?: unknown) {
		emitMlDebug('page', message, detail, CONFIG.recognition.ml.debug);
	}
}
