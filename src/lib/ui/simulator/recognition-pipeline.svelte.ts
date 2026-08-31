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

// How long a recompute waits before retrying when the glyph canvas is detached.
// Long enough that a reattach in the same frame settles first, short enough that
// the guides are never visibly stale.
const DETACHED_CANVAS_RETRY_MS = 50;

/**
 * Whether every recognition in a classified drawing has been through the ML pass.
 *
 * The classifier answers with a fast template result and then refines it one
 * candidate at a time, and the client never says which refinement is the last.
 * A result whose recognitions all carry ML diagnostics is the settled reading,
 * because the ML pass attaches them even when the runtime is unavailable.
 */
function isRefinementComplete(result: ClassifiedDrawing): boolean {
	return result.recognitions.every((recognition) => Boolean(recognition.diagnostics?.ml));
}

/**
 * Dependencies supplied by the simulator session to keep recognition independent
 * from the route and canvas-controller implementation.
 */
interface RecognitionPipelineOptions {
	/** Store of freehand strokes, used by summary derivation. */
	store: StrokeStore;
	/** Editable placements, used by summary derivation. */
	placements: PlacementStore;
	/** Current glyph canvas, needed for classifier dimensions. Null while detached. */
	glyphCanvas: () => HTMLCanvasElement | null;
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
	/** Diagnostics tree displayed in the sidebar. */
	diagnostics = $state<SimulatorDiagnostics>({
		ast: null,
		ir: null,
		parser: null,
		ml: null
	});
	/** Palette-ready shape library built from the dictionary. */
	shapeLibrary = $state<ShapeLibrary | null>(null);
	/**
	 * Whether a recompute is running and its ML refinement has not landed yet.
	 * The status line is showing a template verdict the refinement may still
	 * overturn, so the chrome can say the reading is not final.
	 */
	reading = $state(false);
	/**
	 * Whether the running one-shot cast has finished. A cast is a one-shot, so
	 * the spell stays active and the paper stays tilted long after the effect
	 * canvas has emptied. Waiting out the score's own duration is what turns
	 * that silence into a finished performance, and a spent page is the one
	 * sealed state the pen may tear off for a fresh one.
	 */
	castSpent = $state(false);

	/** Snapshot of ML debug events mirrored from the debug event bus. */
	mlDebugEvents = $state<MlDebugEvent[]>([]);

	#strokes: Stroke[] = [];
	#pipeline: ClassifiedDrawing | null = null;
	#spellIR: SpellIR | null = null;
	#previousRing: RingInfo | null = null;
	#dictionarySnapshot: Dictionary | null = null;
	#recomputeTimer: ReturnType<typeof setTimeout> | null = null;
	#castClockTimer: ReturnType<typeof setTimeout> | null = null;
	#recomputeSeq = 0;
	#disposed = false;
	// Whether the next compile may inherit the running cast's activation stamp.
	// Cleared by an edit that replaces the drawing (`dropCarriedActivation`) and
	// restored as soon as a compile has landed.
	#carryActivation = true;
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

	/**
	 * Rescales recognized geometry into a resized canvas.
	 *
	 * Recognition is async and takes seconds on a full seal, so the guide and seal
	 * layers would otherwise spend that whole time drawing the ring at its old
	 * canvas size while the ink has already been rescaled around them. Scaling the
	 * ring here keeps them locked to the ink until the recompute lands.
	 */
	scaleGeometry(scale: number) {
		const ring = this.#pipeline?.ring;
		if (!ring?.found || scale === 1) {
			return;
		}
		ring.center = { x: ring.center.x * scale, y: ring.center.y * scale };
		ring.radius *= scale;
	}

	/** Clears ring continuity state after undo, clear, or canvas resize. */
	clearPreviousRing() {
		this.#previousRing = null;
	}

	/**
	 * Stops the next compile from inheriting the running cast's clock.
	 *
	 * `carrySpellActivation` holds one performance's stamp steady across the
	 * template and ML passes, which it can only do by keeping the stamp whenever
	 * both compiles read as active. Undo, redo and a loaded preset replace the
	 * drawing while the last spell is still active in state, and recognition is
	 * async, so the state in between is often never applied at all: the compile
	 * that follows would then inherit a clock that has already run out, and the
	 * spell would read active while nothing performed. A resize is not one of
	 * these. It scales the same drawing, and its cast is still the same cast.
	 */
	dropCarriedActivation() {
		this.#carryActivation = false;
	}

	/** Recomputes summary-only state without rerunning recognition. */
	refreshSummary() {
		if (this.dictionary) {
			this.summary = this.#computeSummary();
			this.#armCastClock();
		}
	}

	/**
	 * Drops the compiled spell and classification so a wiped canvas reads blank
	 * immediately: lock, tilt, status, and the spent clock all fall with the ink.
	 * Recognition is async, so without this a clear keeps the old verdict (and a
	 * locked, tilted canvas) on screen until a classify pass lands.
	 */
	resetSpellState() {
		this.cancelActiveRecognition();
		this.#pipeline = null;
		this.#spellIR = null;
		this.#previousRing = null;
		if (this.dictionary) {
			this.summary = this.#computeSummary();
			this.#options.setInputLocked(this.summary.inputLocked);
			this.#armCastClock();
			this.diagnostics = this.#buildDiagnostics();
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
		this.reading = false;
	}

	/** Schedules recognition after a short debounce window. */
	scheduleRecompute(delay: number) {
		if (this.#disposed) {
			return;
		}
		this.cancelScheduledRecompute();
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
			return;
		}

		// The canvas is bound DOM, so it reads null between detach and reattach. A
		// canvas resize schedules a recompute straight into that window, and running
		// this pass against null used to throw out of the debounce timer as an
		// unhandled rejection. The pass cannot simply be dropped either: recognition
		// owns the geometry the guide, seal and diagnostic layers draw from, so
		// losing it leaves them drawing the ring the pre-resize canvas recognized.
		const glyphCanvas = this.#options.glyphCanvas();
		if (!glyphCanvas) {
			this.scheduleRecompute(DETACHED_CANVAS_RETRY_MS);
			return;
		}

		this.refreshStrokes();
		const seq = ++this.#recomputeSeq;
		this.reading = true;
		let result: ClassifiedDrawing;
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
			console.error(error);
			if (seq === this.#recomputeSeq) {
				this.reading = false;
			}
			return;
		}
		this.#applyClassifiedDrawing(result, seq);
	}

	/** Stops pending recognition timers and disposes classifier worker clients. */
	dispose() {
		this.#disposed = true;
		this.reading = false;
		this.cancelScheduledRecompute();
		this.#cancelCastClock();
		disposeDrawingClassifierClient();
	}

	#applyClassifiedDrawing(result: ClassifiedDrawing, seq: number) {
		if (seq !== this.#recomputeSeq) {
			return;
		}

		this.reading = !isRefinementComplete(result);
		this.#pipeline = result;
		this.#previousRing = this.#pipeline.ring;
		this.#spellIR = carrySpellActivation(
			this.#carryActivation ? this.#spellIR : null,
			// The previous compile carries the reading the facing hysteresis needs:
			// the template pass and the ML pass read the same ink, and a facing
			// resting on a class boundary must not change meaning between them.
			compileSpell({
				glyphAST: this.#pipeline.glyphAST,
				config: CONFIG,
				previous: this.#spellIR
			})
		);
		this.#carryActivation = true;
		this.summary = this.#computeSummary();
		this.#options.setInputLocked(this.summary.inputLocked);
		this.#armCastClock();
		this.diagnostics = this.#buildDiagnostics();
	}

	/**
	 * Points `castSpent` at the summary's cast end. The end is a timestamp on the
	 * `performance.now()` clock, so a timer is the only way state learns the
	 * performance is over without a render loop watching for it.
	 */
	#armCastClock() {
		this.#cancelCastClock();
		const endsAt = this.summary.castEndsAt;
		if (endsAt === null) {
			this.castSpent = false;
			return;
		}
		const remainingMs = endsAt - performance.now();
		if (remainingMs <= 0) {
			this.castSpent = true;
			return;
		}
		this.castSpent = false;
		this.#castClockTimer = setTimeout(() => {
			this.#castClockTimer = null;
			this.castSpent = true;
		}, remainingMs);
	}

	#cancelCastClock() {
		if (this.#castClockTimer) {
			clearTimeout(this.#castClockTimer);
			this.#castClockTimer = null;
		}
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
			canRedo: this.#options.canRedo()
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
