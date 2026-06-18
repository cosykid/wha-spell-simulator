<script lang="ts">
	import { compileSpell } from '$lib/compiler/spellBuilder.js';
	import ControlPanel from '$lib/components/ControlPanel.svelte';
	import Diagnostics from '$lib/components/Diagnostics.svelte';
	import DictionaryReference from '$lib/components/DictionaryReference.svelte';
	import Header from '$lib/components/Header.svelte';
	import ShapePalette from '$lib/components/ShapePalette.svelte';
	import { CONFIG } from '$lib/config.js';
	import { buildDiagnosticState } from '$lib/debug/diagnosticState.js';
	import {
		emitMlDebug,
		ML_DEBUG_BUILD_ID,
		mlDebugEnabled as isMlDebugEnabled,
		mlDebugEventsSnapshot,
		type MlDebugEvent
	} from '$lib/debug/mlDebug.js';
	import { loadDictionary } from '$lib/dictionary/dictionaryLoader.js';
	import { DrawingCapture } from '$lib/input/drawingCapture.js';
	import { EraserController } from '$lib/input/eraserController.js';
	import { PlacementController } from '$lib/input/placementController.js';
	import { createPlacementStore } from '$lib/input/placementStore.js';
	import { bakePlacementToStrokes, placementHandles } from '$lib/input/shapeBaker.js';
	import { buildShapeLibrary, defaultTransformForShape } from '$lib/input/shapeLibrary.js';
	import { createStrokeStore } from '$lib/input/strokeStore.js';
	import {
		classifyDrawingOffThread,
		disposeDrawingClassifierClient,
		isDrawingClassifierSuperseded,
		warmDrawingClassifierWorker
	} from '$lib/parser/drawingClassifierClient.js';
	import { CanvasRenderer } from '$lib/renderer/canvasRenderer.js';
	import type {
		ClassifiedDrawing,
		Dictionary,
		Placement,
		PlacementTransform,
		Point,
		Recognition,
		RingInfo,
		ShapeItem,
		ShapeLibrary,
		SpellIR,
		Stroke,
		Vector
	} from '$lib/types.js';
	import { setupCanvasSizing } from '$lib/ui/canvasSizing.js';
	import { computeSummary, INITIAL_SUMMARY } from '$lib/ui/spellSummary.js';
	import { defaultControlValues, buildSpellIR } from '$lib/ui/spellEffectLab.js';
	import { eraseSegment } from '$lib/utils/strokeErase.js';
	import { onMount } from 'svelte';

	const ZOOM_MIN = 0.5;
	const ZOOM_MAX = 3;
	const ZOOM_STEP = 0.25;
	const TOGGLE_PREFERENCES_STORAGE_KEY = 'wha-spell-simulator:toggle-preferences';

	interface TogglePreferences {
		showGuides: boolean;
		showDiagnostics: boolean;
		arrangeShapes: boolean;
	}

	// Reactive UI state.
	let dictionary = $state<Dictionary | null>(null);
	let summary = $state<typeof INITIAL_SUMMARY>({ ...INITIAL_SUMMARY });
	let diagnostics = $state<{ ast: unknown; ir: unknown; parser: unknown; ml: unknown }>({
		ast: null,
		ir: null,
		parser: null,
		ml: null
	});
	let mlDebugEvents = $state<MlDebugEvent[]>([]);
	let showGuides = $state(true);
	let showDiagnostics = $state(false);
	let showPaper = $state(false);
	let togglePreferencesLoaded = $state(false);
	// True once drawing capture has attached its pointer listeners. The status
	// text can leave "Loading" before this (a resize-triggered recompute), so this
	// is the authoritative "the canvas accepts strokes now" signal.
	let inputReady = $state(false);
	let rootTab = $state('dictionary');
	let zoomLevel = $state(1);
	type CanvasTool = 'draw' | 'arrange' | 'erase';
	let activeTool = $state<CanvasTool>('draw');
	let canvasHintDismissed = $state(false);
	let shapeLibrary = $state<ShapeLibrary | null>(null);
	let armedShapeId = $state<string | null>(null);
	let panEnabled = $state(false);
	let panX = $state(0);
	let panY = $state(0);
	let panStartClientX = 0;
	let panStartClientY = 0;
	let panStartPanX = 0;
	let panStartPanY = 0;
	let selected = $state<{ kind: string; sourceId: string; transform: PlacementTransform } | null>(
		null
	);
	let draggedShape: ShapeItem | null = null;
	let dragPreview = $state<{ item: ShapeItem; x: number; y: number } | null>(null);
	let shapeDragPointerId: number | null = null;

	function handleZoomIn() {
		zoomLevel = Math.min(ZOOM_MAX, zoomLevel + ZOOM_STEP);
	}

	function startPan(event: PointerEvent) {
		if (!panEnabled) return;
		if (event.button !== undefined && event.button !== 0) return;
		event.preventDefault();
		panStartClientX = event.clientX;
		panStartClientY = event.clientY;
		panStartPanX = panX;
		panStartPanY = panY;
		window.addEventListener('pointermove', handlePanMove);
		window.addEventListener('pointerup', endPan);
		window.addEventListener('pointercancel', endPan);
	}

	function handlePanMove(event: PointerEvent) {
		if (!panEnabled) return;
		const dx = event.clientX - panStartClientX;
		const dy = event.clientY - panStartClientY;
		panX = panStartPanX + dx;
		panY = panStartPanY + dy;
	}

	function endPan(_event: PointerEvent) {
		window.removeEventListener('pointermove', handlePanMove);
		window.removeEventListener('pointerup', endPan);
		window.removeEventListener('pointercancel', endPan);
	}

	function handleZoomOut() {
		zoomLevel = Math.max(ZOOM_MIN, zoomLevel - ZOOM_STEP);
	}

	// Bound DOM nodes.
	let glyphCanvas: HTMLCanvasElement;
	let effectCanvas: HTMLCanvasElement;
	let canvasShell: HTMLDivElement;
	let workspace: HTMLElement;

	// Imperative pipeline state (read by the render loop, not the template).
	const store = createStrokeStore();
	const placements = createPlacementStore();
	let renderer: CanvasRenderer | null = null;
	let capture: DrawingCapture | null = null;
	let controller: PlacementController | null = null;
	let eraser: EraserController | null = null;
	let pipeline: ClassifiedDrawing | null = null;
	let spellIR: SpellIR | null = null;
	let previousRing: RingInfo | null = null;
	let paperApi: any = null;
	let demoSpell: { spellIR: SpellIR; ring: RingInfo; expiresAt: number } | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let workspaceResizeObserver: ResizeObserver | null = null;
	let rafId: number | null = null;
	let recomputeTimer: ReturnType<typeof setTimeout> | null = null;
	let armedShape: ShapeItem | null = null;
	let selectedPlacementId: string | null = null;
	let strokes: ReturnType<typeof store.getStrokes> = [];

	// Plain (non-reactive) snapshot of the dictionary, posted to the
	// classifier/recognition workers. `$state` proxies are not structured-cloneable,
	// so posting the reactive value directly throws DataCloneError and silently
	// drops every recognition onto the main thread. Snapshot once per load (not per
	// recompute) so the reference stays stable and the workers keep their cached
	// dictionary instead of re-initializing on every stroke.
	let dictionarySnapshot: Dictionary | null = null;

	const DESKTOP_LAYOUT_MIN_WIDTH = 1051;
	const CANVAS_LAYOUT_MIN_SIDE_COLUMNS = 230 + 280;
	let canvasHeightMatched = $state(false);

	function loadTogglePreferences() {
			try {
				const stored = localStorage.getItem(TOGGLE_PREFERENCES_STORAGE_KEY);
				if (!stored) {
					return;
				}

				const preferences = JSON.parse(stored) as Partial<TogglePreferences>;
				if (typeof preferences.showGuides === 'boolean') {
					showGuides = preferences.showGuides;
				}
				if (typeof preferences.showDiagnostics === 'boolean') {
					showDiagnostics = preferences.showDiagnostics;
				}
				if (typeof preferences.showPaper === 'boolean') {
					showPaper = preferences.showPaper;
				}
				if (preferences.arrangeShapes === true) {
					activeTool = 'arrange';
				}
			} catch {
				// Ignore invalid or unavailable local storage and keep the defaults.
			}
		}

	function saveTogglePreferences() {
			try {
				localStorage.setItem(
					TOGGLE_PREFERENCES_STORAGE_KEY,
					JSON.stringify({ showGuides, showDiagnostics, showPaper, arrangeShapes: activeTool === 'arrange' })
				);
			} catch {
				// Preference persistence is best-effort.
			}
		}

	// Unified undo/redo history. A snapshot captures the full drawing state (freehand
	// strokes plus editable placements) so undo and redo work the same for both. Oldest
	// snapshots are dropped once the stack grows past MAX_HISTORY.
	const MAX_HISTORY = 100;
	interface Snapshot {
		strokes: Stroke[];
		placements: Placement[];
	}
	let history: Snapshot[] = [];
	let historyIndex = -1;

	function mergedStrokes() {
		return [...store.getStrokes(), ...placements.getPlacements().flatMap(bakePlacementToStrokes)];
	}

	function snapshot(): Snapshot {
		return {
			strokes: store.getStrokes(),
			placements: placements.getPlacements().map((placement) => ({
				...placement,
				transform: { ...placement.transform }
			}))
		};
	}

	// Rescale a snapshot into a resized canvas so undo/redo keep correct geometry after
	// the window changes size, mirroring how the live strokes and placements are scaled.
	function scaleSnapshot(snap: Snapshot, scaleX: number, scaleY: number): Snapshot {
		return {
			strokes: snap.strokes.map((stroke) => ({
				...stroke,
				points: stroke.points.map((point) => ({
					...point,
					x: point.x * scaleX,
					y: point.y * scaleY
				}))
			})),
			placements: snap.placements.map((placement) => ({
				...placement,
				transform: {
					...placement.transform,
					cx: placement.transform.cx * scaleX,
					cy: placement.transform.cy * scaleY,
					scaleX: placement.transform.scaleX * scaleX,
					scaleY: placement.transform.scaleY * scaleY
				}
			}))
		};
	}

	function pushHistory() {
		history = [...history.slice(0, historyIndex + 1), snapshot()].slice(-MAX_HISTORY);
		historyIndex = history.length - 1;
	}

	function restore(snap: Snapshot) {
		store.load(snap.strokes);
		placements.load(snap.placements);
		if (selectedPlacementId && !placements.get(selectedPlacementId)) {
			selectedPlacementId = null;
		}
		setSelected(selectedPlacementId);
		previousRing = null;
		void recompute();
	}

	function buildDiagnostics() {
		const state = buildDiagnosticState({
			rawStrokes: strokes,
			pipeline,
			spellIR
		});
		const pipelineRecognitions = (
			state.recognitions instanceof Array ? state.recognitions : []
		) as Recognition[];
		const mlRecognitions = pipelineRecognitions.map((recognition) => ({
			candidateId: recognition.candidateId,
			template: {
				recognized: recognition.recognized,
				status: recognition.recognitionStatus,
				kind: recognition.kind,
				id: recognition.id,
				confidence: recognition.confidence,
				topMatches: recognition.diagnostics?.topMatches ?? []
			},
			ml: recognition.diagnostics?.ml ?? null
		}));
		const attachedMlDiagnostics = mlRecognitions.flatMap((recognition) =>
			recognition.ml ? [recognition.ml] : []
		);
		return {
			ast: state.glyphAST,
			ir: state.spellIR,
			ml: {
				status:
					attachedMlDiagnostics.length > 0
						? 'hybrid diagnostics attached'
						: pipeline
							? 'pipeline has no ML diagnostics yet'
							: 'waiting for recognition pipeline',
				debugEnabled: mlDebugEnabled(),
				enabled: CONFIG.recognition.ml.enabled,
				buildId: ML_DEBUG_BUILD_ID,
				modelUrl: CONFIG.recognition.ml.modelUrl,
				classMapUrl: CONFIG.recognition.ml.classMapUrl,
				source:
					'classifyDrawingOffThread -> drawingClassifierWorker -> recognizeCandidatesHybridMl',
				strokeCount: strokes.length,
				pipelineReady: Boolean(pipeline),
				ringFound: pipeline?.ring?.found ?? false,
				candidateCount: state.candidates instanceof Array ? state.candidates.length : 0,
				recognitionCount: state.recognitions instanceof Array ? state.recognitions.length : 0,
				mlDiagnosticsAttached: attachedMlDiagnostics.length,
				mlAvailableCount: attachedMlDiagnostics.filter((ml) => ml.available).length,
				mlAcceptedCount: attachedMlDiagnostics.filter((ml) => ml.accepted).length,
				mlUnavailableReasons: [
					...new Set(
						attachedMlDiagnostics
							.filter((ml) => !ml.available)
							.map((ml) => ml.reason ?? 'unavailable')
					)
				],
				events: mlDebugEvents,
				recognitions: mlRecognitions
			},
			parser: {
				rawStrokes: state.rawStrokes,
				ring: state.ring,
				classifications: state.classifications,
				candidates: state.candidates,
				recognitions: state.recognitions
			}
		};
	}

	let recomputeSeq = 0;
	const STROKE_RECOGNITION_DEBOUNCE_MS = 120;

	function cancelScheduledRecompute() {
		if (recomputeTimer) {
			clearTimeout(recomputeTimer);
			recomputeTimer = null;
		}
	}

	function cancelActiveRecognition() {
		// Invalidate any in-flight recognition so a stale result can't apply while a
		// new stroke is being drawn. The recognition worker pool is intentionally
		// left running: its workers cache the dictionary and learned assets, and the
		// sequence guard in recompute() already drops superseded results, so bumping
		// the sequence is enough to cancel without tearing anything down.
		cancelScheduledRecompute();
		recomputeSeq += 1;
	}

	function dismissCanvasHint() {
		if (canvasHintDismissed) {
			return;
		}
		canvasHintDismissed = true;
		summary = { ...summary, hintHidden: true };
	}

	function scheduleRecompute(delay: number) {
		cancelScheduledRecompute();
		recomputeTimer = setTimeout(() => {
			recomputeTimer = null;
			void recompute();
		}, delay);
	}

	function mlDebugEnabled() {
		return isMlDebugEnabled(CONFIG.recognition.ml.debug);
	}

	function mlDebugLog(message: string, detail?: unknown) {
		emitMlDebug('page', message, detail, CONFIG.recognition.ml.debug);
	}

	function applyClassifiedDrawing(result: ClassifiedDrawing, seq: number) {
			if (seq !== recomputeSeq) {
				return;
			}

			// detect ring closure transition
			const wasClosed = Boolean(previousRing?.complete);
			const nowClosed = Boolean(result.ring?.complete);

			pipeline = result;
			previousRing = pipeline.ring;
			spellIR = compileSpell({ glyphAST: pipeline.glyphAST, config: CONFIG });
			summary = computeSummary({
				store,
				pipeline,
				spellIR,
				showGuides,
				arrangeMode: activeTool === 'arrange',
				eraseMode: activeTool === 'erase',
				placementCount: placements.count(),
				hintDismissed: canvasHintDismissed,
				canUndo: historyIndex > 0,
				canRedo: historyIndex < history.length - 1
			});
			capture?.setLocked(summary.inputLocked);
			diagnostics = buildDiagnostics();

			// If the ring just closed and the paper toggle is enabled, spawn a paper that will
			// react to effect particles. Prefer the ring's detected center if available so the
			// paper falls back onto the seal; otherwise fall back to canvas center.
			if (!wasClosed && nowClosed && showPaper && paperApi && typeof paperApi.spawn === 'function') {
				try {
					const canvas = glyphCanvas;
					const ringCenter = result.ring?.center;
					const pos = ringCenter
						? { x: ringCenter.x, y: ringCenter.y }
						: canvas
						? { x: canvas.width / 2, y: canvas.height / 2 }
						: undefined;
					// spawn() applies an internal "lift" by default so the paper appears
					// slightly above the chosen point and will fall under gravity.
					paperApi.spawn({ pos });
				} catch (e) {
					console.error('paper spawn failed', e);
				}
			}
		}

	async function recompute() {
		if (!dictionary || !dictionarySnapshot) {
			return;
		}

		// Freehand strokes and any baked placements are classified together, so the
		// editable shapes contribute to ring/sigil detection just like hand-drawn ink.
		strokes = mergedStrokes();

		// Classification runs off-thread, so this is async. Guard with a sequence
		// token: rapid strokes can overlap, and only the newest result should win.
		// previousRing is read synchronously here, before the await.
		const seq = ++recomputeSeq;
		let result: ClassifiedDrawing;
		mlDebugLog('recompute starting', {
			strokes: strokes.length,
			previousRingFound: previousRing?.found ?? false,
			canvasWidth: glyphCanvas.width,
			canvasHeight: glyphCanvas.height
		});
		try {
			result = await classifyDrawingOffThread(
				{
					strokes,
					previousRing,
					canvasWidth: glyphCanvas.width,
					canvasHeight: glyphCanvas.height,
					dictionary: dictionarySnapshot,
					config: CONFIG
				},
				(mlResult) => applyClassifiedDrawing(mlResult, seq)
			);
		} catch (error) {
			if (isDrawingClassifierSuperseded(error)) {
				return;
			}
			console.error(error);
			return;
		}
		applyClassifiedDrawing(result, seq);
	}

	function animationFrame(timestamp: number) {
		const activePlacement =
			activeTool === 'arrange' && selectedPlacementId ? placements.get(selectedPlacementId) : null;
		renderer!.renderGlyph({
			strokes,
			currentStroke: capture!.getCurrentStrokeView(),
			pipeline,
			showGuides,
			showDebug: showDiagnostics,
			selection: activePlacement ? placementHandles(activePlacement) : null
		});

		if (spellIR?.active) {
			renderer!.renderActivatedGlyph({
				activatedAt: spellIR.activatedAt,
				duration: spellIR.duration,
				strokes,
				pipeline,
				timestamp
			});
		}

			// If a demo spell is active, let it override the rendered effect for its lifetime.
			if (demoSpell) {
				// expire demoSpell when its time passes
				if (performance.now() > demoSpell.expiresAt) {
					demoSpell = null;
				} else {
					renderer!.renderEffect({ spellIR: demoSpell.spellIR, ring: demoSpell.ring, timestamp, showGuides });
				}
			} else {
				renderer!.renderEffect({ spellIR, ring: pipeline?.ring, timestamp, showGuides });
			}

		// If the paper module is attached, run its frame step after effects render so
		// papers draw on top of effect particles and remain visible.
		if (paperApi && typeof paperApi.frame === 'function') {
								try {
									paperApi.frame(timestamp, demoSpell?.ring ?? pipeline?.ring);
								} catch (e) {
									console.error('paper frame failed', e);
								}
								}

		rafId = requestAnimationFrame(animationFrame);
	}

	function handleUndo() {
		if (historyIndex <= 0) {
			return;
		}
		cancelActiveRecognition();
		historyIndex -= 1;
		restore(history[historyIndex]);
	}

	function handleRedo() {
		if (historyIndex >= history.length - 1) {
			return;
		}
		cancelActiveRecognition();
		historyIndex += 1;
		restore(history[historyIndex]);
	}

	function handleClear() {
			cancelActiveRecognition();
			store.clear();
			placements.clear();
			armedShape = null;
			armedShapeId = null;
			setSelected(null);
			previousRing = null;
			// clear any demo spell or spawned papers too
			demoSpell = null;
			try {
				if (paperApi && typeof paperApi.removeAll === 'function') {
					paperApi.removeAll();
				}
			} catch (e) {
				console.error('clear papers failed', e);
			}
			pushHistory();
			void recompute();
		}

	function setSelected(id: string | null) {
		selectedPlacementId = id;
		const placement = id ? placements.get(id) : null;
		selected = placement
			? {
					kind: placement.kind,
					sourceId: placement.sourceId,
					transform: { ...placement.transform }
				}
			: null;
	}

	function canvasPointFromClient(clientX: number, clientY: number): Vector {
		const rect = glyphCanvas.getBoundingClientRect();
		return {
			x: (clientX - rect.left) * (glyphCanvas.width / rect.width),
			y: (clientY - rect.top) * (glyphCanvas.height / rect.height)
		};
	}

	function placeShape(item: ShapeItem, point: Vector): string {
		dismissCanvasHint();
		const placement = placements.add({
			kind: item.kind,
			sourceId: item.sourceId,
			baseStrokes: item.baseStrokes,
			transform: defaultTransformForShape(item, point, glyphCanvas)
		});
		setSelected(placement.id);
		pushHistory();
		recompute();
		return placement.id;
	}

	function placeArmedShape(point: Vector): string | null {
		if (!armedShape) {
			return null;
		}
		const placed = placeShape(armedShape, point);
		armedShape = null;
		armedShapeId = null;
		return placed;
	}

	function deletePlacement(id: string) {
		placements.remove(id);
		if (selectedPlacementId === id) {
			setSelected(null);
		}
		pushHistory();
		recompute();
	}

	// Bake a placement into the stroke store as permanent ink, then drop the editable
	// placement so it behaves exactly like hand-drawn strokes. Callers record history.
	function commitPlacement(id: string) {
		const placement = placements.get(id);
		if (!placement) {
			return;
		}
		bakePlacementToStrokes(placement).forEach((stroke) => store.addStroke(stroke.points));
		placements.remove(id);
		if (selectedPlacementId === id) {
			setSelected(null);
		}
	}

	function handleCommitSelected() {
		if (!selectedPlacementId) {
			return;
		}
		commitPlacement(selectedPlacementId);
		pushHistory();
		recompute();
	}

	function eraserCursorCss(): string {
		// The brush radius is in canvas pixels (1000x1000 backing store); scale it
		// to CSS pixels using the canvas's on-screen box so the cursor ring matches
		// the actual erase footprint at any layout size or zoom level.
		const rect = glyphCanvas.getBoundingClientRect();
		const scale = rect.width > 0 ? rect.width / glyphCanvas.width : 1;
		const radius = Math.max(4, CONFIG.eraser.radius * scale);
		const size = Math.ceil(radius * 2 + 2);
		const center = size / 2;
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="#241b16" stroke-width="1.5" opacity="0.8"/></svg>`;
		return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${center} ${center}, crosshair`;
	}

	function updateCanvasCursor() {
		if (!glyphCanvas) return;

		if (panEnabled) {
			glyphCanvas.style.cursor = summary.canvasLocked ? 'not-allowed' : 'grab';
			return;
		}

		if (activeTool === 'arrange') {
			glyphCanvas.style.cursor = 'default';
		} else if (activeTool === 'erase') {
			glyphCanvas.style.cursor = eraserCursorCss();
		} else {
			glyphCanvas.style.cursor = 'crosshair';
		}
	}

	function setTool(tool: CanvasTool) {
		activeTool = tool;
		controller?.setActive(tool === 'arrange');
		eraser?.setActive(tool === 'erase');

		// Make arrange and pan mutually exclusive: entering arrange should disable pan.
		if (tool === 'arrange') {
			panEnabled = false;
		}

		// Lock capture when we're not drawing, when the summary requests it, or while panning.
		capture?.setLocked(tool !== 'draw' || summary.canvasLocked || panEnabled);
		updateCanvasCursor();

		if (tool !== 'arrange') {
			armedShape = null;
			armedShapeId = null;
			setSelected(null);
		}
		recompute();
	}

	function shapePreviewPoints(stroke: Point[]): string {
		return stroke
			.map((point) => {
				const x = Number(point.x);
				const y = Number(point.y);
				if (!Number.isFinite(x) || !Number.isFinite(y)) {
					return null;
				}
				return `${Math.round((8 + x * 84) * 10) / 10},${Math.round((8 + y * 84) * 10) / 10}`;
			})
			.filter(Boolean)
			.join(' ');
	}

	function beginShapeDrag(item: ShapeItem, event: PointerEvent) {
		if (event.button !== undefined && event.button !== 0) {
			return;
		}
		event.preventDefault();
		endShapeDrag();
		draggedShape = item;
		armedShape = item;
		armedShapeId = item.id;
		shapeDragPointerId = event.pointerId;
		dragPreview = { item, x: event.clientX, y: event.clientY };
		if (activeTool !== 'arrange') {
			setTool('arrange');
		}
		window.addEventListener('pointermove', handleShapeDragMove);
		window.addEventListener('pointerup', handleShapeDragEnd);
		window.addEventListener('pointercancel', handleShapeDragEnd);
	}

	function endShapeDrag() {
		draggedShape = null;
		armedShape = null;
		armedShapeId = null;
		shapeDragPointerId = null;
		dragPreview = null;
		window.removeEventListener('pointermove', handleShapeDragMove);
		window.removeEventListener('pointerup', handleShapeDragEnd);
		window.removeEventListener('pointercancel', handleShapeDragEnd);
	}

	function handleShapeDragMove(event: PointerEvent) {
		if (!draggedShape || shapeDragPointerId !== event.pointerId) {
			return;
		}
		event.preventDefault();
		dragPreview = { item: draggedShape, x: event.clientX, y: event.clientY };
	}

	function handleShapeDragEnd(event: PointerEvent) {
		if (!draggedShape || shapeDragPointerId !== event.pointerId) {
			return;
		}
		event.preventDefault();
		const item = draggedShape;
		const rect = glyphCanvas.getBoundingClientRect();
		const insideCanvas =
			event.clientX >= rect.left &&
			event.clientX <= rect.right &&
			event.clientY >= rect.top &&
			event.clientY <= rect.bottom;
		endShapeDrag();
		if (insideCanvas) {
			placeShape(item, canvasPointFromClient(event.clientX, event.clientY));
			canvasShell.focus();
		}
	}

	function updateSelectedTransform(patch: Partial<PlacementTransform>) {
		if (!selectedPlacementId) {
			return;
		}
		placements.update(selectedPlacementId, patch);
		setSelected(selectedPlacementId);
		void recompute();
	}

	function handleToggleGuides() {
		// Guides only affect the canvas hint visibility and guide rendering;
		// refresh the summary without re-running the parser pipeline.
		if (dictionary) {
			summary = computeSummary({
				store,
				pipeline,
				spellIR,
				showGuides,
				arrangeMode: activeTool === 'arrange',
				eraseMode: activeTool === 'erase',
				placementCount: placements.count(),
				hintDismissed: canvasHintDismissed,
				canUndo: historyIndex > 0,
				canRedo: historyIndex < history.length - 1
			});
		}
	}

	function scalePlacements(scaleX: number, scaleY: number) {
		for (const placement of placements.getPlacements()) {
			placements.update(placement.id, {
				cx: placement.transform.cx * scaleX,
				cy: placement.transform.cy * scaleY,
				scaleX: placement.transform.scaleX * scaleX,
				scaleY: placement.transform.scaleY * scaleY
			});
		}
	}

	function updateCanvasLayoutMode() {
		if (!workspace) {
			return;
		}
		const rect = workspace.getBoundingClientRect();
		const styles = getComputedStyle(workspace);
		const columnGap = Number.parseFloat(styles.columnGap) || 0;
		const requiredWidth = rect.height + CANVAS_LAYOUT_MIN_SIDE_COLUMNS + columnGap * 2;
		canvasHeightMatched =
			window.innerWidth >= DESKTOP_LAYOUT_MIN_WIDTH && rect.width >= requiredWidth;
	}

	function handleToggleArrange() {
		setTool(activeTool === 'arrange' ? 'draw' : 'arrange');
	}

	function handleToggleEraser() {
		setTool(activeTool === 'erase' ? 'draw' : 'erase');
	}

	// Mirror the original `body.diagnostics-visible` toggle the debug CSS keys off.
	$effect(() => {
		document.body.classList.toggle('diagnostics-visible', showDiagnostics);
		if (togglePreferencesLoaded) {
			saveTogglePreferences();
		}
		return () => document.body.classList.remove('diagnostics-visible');
	});

	// Manage the paper simulation based on the UI toggle. If disabled, remove any papers.
	$effect(() => {
		if (!paperApi) return;
		if (!showPaper) {
			if (typeof paperApi.removeAll === 'function') {
				paperApi.removeAll();
			}
			return;
		}
		// If enabled and a ring is already closed, spawn one immediately.
		if (showPaper && pipeline?.ring?.complete) {
			try {
				const canvas = glyphCanvas;
				const pos = canvas ? { x: canvas.width / 2, y: canvas.height / 2 } : undefined;
				paperApi.spawn({ pos });
			} catch (e) {
				console.error('paper spawn failed', e);
			}
		}
	});

	// Keep the canvas cursor in sync with the active tool and re-derive the
	// eraser ring's size after zoom changes resize the canvas's on-screen box.
	$effect(() => {
		// Re-run when zoom, the active tool, pan state, or summary lock change.
		void zoomLevel;
		void activeTool;
		void panEnabled;
		void summary.canvasLocked;

		// Ensure capture is locked whenever we're not in draw mode, when the summary
		// explicitly requests it, or while pan mode is active.
		capture?.setLocked(activeTool !== 'draw' || summary.canvasLocked || panEnabled);
		updateCanvasCursor();
	});

	function handleTogglePan() {
		panEnabled = !panEnabled;
		// If enabling pan, make sure arrange mode is turned off so they remain exclusive.
		if (panEnabled && activeTool === 'arrange') {
			setTool('draw');
		}
		// The $effect above will refresh capture lock; update cursor now for snappiness.
		updateCanvasCursor();
	}

	// Spawn a paper immediately (prefer ring center; fall back to canvas center)
	function spawnPaperNow(pos?: { x: number; y: number }) {
		if (!paperApi || typeof paperApi.spawn !== 'function') {
			console.warn('paper simulation not available');
			return null;
		}
		try {
			const canvas = glyphCanvas;
			let spawnPos = pos;
			if (!spawnPos) {
				const ringCenter = pipeline?.ring?.center;
				spawnPos = ringCenter ? { x: ringCenter.x, y: ringCenter.y } : canvas ? { x: canvas.width / 2, y: canvas.height / 2 } : undefined;
			}
			const p = paperApi.spawn({ pos: spawnPos });
			console.log('spawnPaperNow -> spawned', p?.id ?? p);
			return p;
		} catch (e) {
			console.error('paper spawn failed', e);
			return null;
		}
	}

	// Cast a simple demo fire spell positioned on the ring or canvas center. This
	// creates a synthetic SpellIR and temporary ring that the renderer will use for
	// the active effect for the spell's duration.
	function castDemoFireSpell() {
		if (!renderer) {
			console.warn('renderer not ready');
			return;
		}
		const values = defaultControlValues();
		// tuned for a quick fire burst
		values.effectScale = 1.6;
		values.force = 0.9;
		values.spread = 0.28;
		values.focus = 0.6;
		values.duration = 3; // seconds
		values.gravity = 1;
		values.xTiltDeg = 0;
		values.yTiltDeg = -28;
		values.ringRadius = 0.34;
		// backdate activation so emission begins immediately (skip portal tilt hold)
		const activatedAt = performance.now() - (CONFIG.renderer?.portalTiltMs ?? 0) - 30;
		const spell = buildSpellIR({ values, element: 'fire', sigil: 'fire', activatedAt, config: CONFIG });
		const canvas = glyphCanvas;
		const ring: RingInfo =
			pipeline?.ring ?? {
				found: true,
				complete: true,
				center: canvas ? { x: canvas.width / 2, y: canvas.height / 2 } : { x: 400, y: 300 },
				radius: canvas ? Math.min(canvas.width, canvas.height) * values.ringRadius : 240
			};
		demoSpell = { spellIR: spell, ring, expiresAt: performance.now() + spell.duration * 1000 + 200 };
		console.log('castDemoFireSpell -> demoSpell created', { activatedAt: spell.activatedAt, duration: spell.duration });
		}

	onMount(async () => {
		loadTogglePreferences();
		togglePreferencesLoaded = true;
		mlDebugEvents = mlDebugEventsSnapshot();
		const handleMlDebug = () => {
			mlDebugEvents = mlDebugEventsSnapshot();
			diagnostics = buildDiagnostics();
		};
		window.addEventListener('wha:ml-debug', handleMlDebug);
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

		renderer = new CanvasRenderer({ glyphCanvas, effectCanvas, config: CONFIG });
				// Paper simulation integration (optional, modular).
				// To remove this feature entirely: delete `src/lib/ui/paperSimulation.ts` and
				// remove the three-line attach block below (the import/attach and the
				// paper spawn call in `applyClassifiedDrawing`). The module is self-contained.
				try {
					const mod = await import('$lib/ui/paperSimulation.js');
					if (mod && typeof mod.attachPaperSimulation === 'function') {
						// capture API so we can spawn/remove papers in response to UI
						paperApi = await mod.attachPaperSimulation(renderer as any);
						// expose for debugging in the console: `window.__paperApi.spawn({ pos })`.
						(window as any).__paperApi = paperApi;
					}
					} catch (e) {
						// ignore if not present
					}
				capture = new DrawingCapture(glyphCanvas, store, CONFIG, {
					onStart: () => {
						cancelActiveRecognition();
						dismissCanvasHint();
					},
			onCommit: () => {
				pushHistory();
				strokes = mergedStrokes();
				scheduleRecompute(STROKE_RECOGNITION_DEBOUNCE_MS);
			}
		});
		controller = new PlacementController(glyphCanvas, placements, {
			getSelectedId: () => selectedPlacementId,
			setSelectedId: setSelected,
			hasArmedShape: () => armedShape !== null,
			placeShape: placeArmedShape,
			onChange: () => {
				if (selectedPlacementId) {
					setSelected(selectedPlacementId);
				}
				// Refresh the rendered ink so the shape tracks the pointer live, but hold off
				// on recognition (the expensive part of recompute) until the gesture settles.
				// onInteractionEnd reclassifies once the shape is dropped.
				strokes = mergedStrokes();
			},
			onInteractionEnd: () => {
				pushHistory();
				recompute();
			}
		});
		controller.enable();
		controller.setActive(activeTool === 'arrange');
		eraser = new EraserController(glyphCanvas, {
			onBegin: () => {
				cancelActiveRecognition();
				dismissCanvasHint();
			},
			applyErase: (from, to) => {
				// peekStrokes avoids a per-pointermove deep clone; eraseSegment never
				// mutates its input and store.load deep-copies what it is given.
				const result = eraseSegment(store.peekStrokes(), from, to, CONFIG.eraser);
				if (!result.changed) {
					return false;
				}
				store.load(result.strokes);
				// Refresh the rendered ink live; recognition waits for onCommit.
				strokes = mergedStrokes();
				return true;
			},
			onCommit: (changed) => {
				if (changed) {
					pushHistory();
				}
				// Recompute even for a no-op gesture: onBegin invalidated any
				// in-flight classification, so re-run it against current ink.
				void recompute();
			}
		});
		eraser.enable();
		eraser.setActive(activeTool === 'erase');
		resizeObserver = setupCanvasSizing({
			elements: { canvasShell, glyphCanvas, effectCanvas },
			store,
			onCanvasResized: ({ scale }) => {
				// The canvas is locked to a 1:1 ratio, so a single uniform scale applies
				// to both axes. Live strokes are rescaled inside setupCanvasSizing; here we
				// keep placements and the undo history in sync with the new resolution.
				if (scale !== 1) {
					scalePlacements(scale, scale);
					history = history.map((snap) => scaleSnapshot(snap, scale, scale));
				}
				previousRing = null;
				updateCanvasCursor();
				scheduleRecompute(60);
			}
		});
		workspaceResizeObserver = new ResizeObserver(updateCanvasLayoutMode);
		workspaceResizeObserver.observe(workspace);
		window.addEventListener('resize', updateCanvasLayoutMode);
		updateCanvasLayoutMode();

		rafId = requestAnimationFrame(animationFrame);

		let cancelled = false;
		(async () => {
			try {
				dictionary = await loadDictionary();
				if (cancelled) {
					return;
				}
				dictionarySnapshot = $state.snapshot(dictionary) as Dictionary;
				warmDrawingClassifierWorker(dictionarySnapshot, CONFIG);
				shapeLibrary = buildShapeLibrary(dictionary);
				capture.enable();
				history = [snapshot()];
				historyIndex = 0;
				inputReady = true;
				void recompute();
			} catch (error) {
				console.error(error);
				summary = { ...summary, statusText: 'Dictionary load failed', statusClass: 'invalid' };
			}
		})();

		function handleKeydown(event: KeyboardEvent) {
			const target = event.target as HTMLElement | null;
			const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
			if (activeTool === 'arrange' && selectedPlacementId && !typing) {
				if (event.key === 'Enter') {
					event.preventDefault();
					handleCommitSelected();
					return;
				}
				if (event.key === 'Delete' || event.key === 'Backspace') {
					event.preventDefault();
					deletePlacement(selectedPlacementId);
					return;
				}
			}

			// Global shortcuts (no modifier) — ignore when typing in inputs
			if (!typing) {
				const nk = event.key.toLowerCase();
				if (nk === 'p') {
					event.preventDefault();
					spawnPaperNow();
					return;
				}
				if (nk === 'f') {
					event.preventDefault();
					castDemoFireSpell();
					return;
				}
				if (nk === 'c') {
					event.preventDefault();
					handleClear();
					return;
				}
			}

			const isMac = navigator.platform.toUpperCase().includes('MAC');
			const ctrl = isMac ? event.metaKey : event.ctrlKey;
			if (!ctrl) return;
			const key = event.key.toLowerCase();

			if (key === 'z' && !event.shiftKey) {
				event.preventDefault();
				handleUndo();
			} else if (key === 'z' && event.shiftKey) {
				event.preventDefault();
				handleRedo();
			} else if (key === 'y') {
				event.preventDefault();
				handleRedo();
			}
		}

		window.addEventListener('keydown', handleKeydown);

		return () => {
			cancelled = true;
			if (rafId) {
				cancelAnimationFrame(rafId);
			}
			cancelScheduledRecompute();
			capture?.disable();
			controller?.disable();
			eraser?.disable();
			inputReady = false;
			endShapeDrag();
			resizeObserver?.disconnect();
			workspaceResizeObserver?.disconnect();
			window.removeEventListener('resize', updateCanvasLayoutMode);
			window.removeEventListener('keydown', handleKeydown);
			window.removeEventListener('wha:ml-debug', handleMlDebug);
			disposeDrawingClassifierClient();
		};
	});
</script>

<svelte:head>
	<title>Witch Hat Atelier Spell Simulator</title>
</svelte:head>

<div class="app-shell simulator-shell">
	<Header title="Glyph Compiler" eyebrow="Witch Hat Atelier Spell Simulator" />

	<main class="workspace" class:canvas-height-matched={canvasHeightMatched} bind:this={workspace}>
		<ControlPanel
		{summary}
		bind:showGuides
		bind:showDiagnostics
		bind:showPaper
		onToggleGuides={handleToggleGuides}
		onSpawnPaper={spawnPaperNow}
		onCastFire={castDemoFireSpell}
	/>

		<section class="canvas-panel" aria-label="Spell drawing surface">
			<div
				class="canvas-shell"
				data-testid="canvas-shell"
				bind:this={canvasShell}
				class:portal-active={summary.portalActive}
				role="region"
				aria-label="Spell drawing canvas"
				tabindex="-1"
			>
				<p
					class="canvas-hint"
					id="canvasHint"
					data-testid="canvas-hint"
					class:hidden={summary.hintHidden}
					class:below-actions={!summary.hintHidden && !summary.undoDisabled}
				>
					Draw an open spell ring. Place sigils in the center and signs around them. When everything
					is ready, seal the circle to awaken the spell.
				</p>
				<div
					class="canvas-action-controls"
					class:hidden={!summary.hintHidden && summary.undoDisabled}
					aria-label="Canvas actions"
				>
					<button
						type="button"
						id="undoButton"
						data-testid="undo-button"
						aria-label="Undo"
						title="Undo"
						data-tooltip="Undo"
						disabled={summary.undoDisabled}
						onclick={handleUndo}
					>
						<svg aria-hidden="true" viewBox="0 0 24 24">
							<path d="M9 14 4 9l5-5" />
							<path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
						</svg>
					</button>
					<button
						type="button"
						id="redoButton"
						data-testid="redo-button"
						aria-label="Redo"
						title="Redo"
						data-tooltip="Redo"
						disabled={summary.redoDisabled}
						onclick={handleRedo}
					>
						<svg aria-hidden="true" viewBox="0 0 24 24">
							<path d="m15 14 5-5-5-5" />
							<path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
						</svg>
					</button>
					<button
						type="button"
						id="clearButton"
						data-testid="clear-button"
						aria-label="Clear"
						title="Clear"
						data-tooltip="Clear"
						onclick={handleClear}
					>
						<svg aria-hidden="true" viewBox="0 0 24 24">
							<path d="M3 6h18" />
							<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
							<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
							<path d="M10 11v6" />
							<path d="M14 11v6" />
						</svg>
					</button>
				</div>
				<div
					class="canvas-container"
					data-testid="canvas-container"
					onpointerdown={startPan}
					tabindex="0"
					aria-label="Canvas container for panning"
					role="button"
					style="transform: translate({panX}px, {panY}px) scale({zoomLevel});"
				>
					<canvas
						id="glyphCanvas"
						data-testid="glyph-canvas"
						data-input-ready={inputReady}
						bind:this={glyphCanvas}
						class:locked={summary.canvasLocked}
						width="1000"
						height="1000"
					></canvas>
					<canvas
						id="effectCanvas"
						data-testid="effect-canvas"
						bind:this={effectCanvas}
						width="1000"
						height="1000"
					></canvas>
				</div>
				<div class="zoom-controls" aria-label="Canvas zoom controls">
					<button
						type="button"
						id="arrangeToggle"
						data-testid="arrange-toggle"
						class="tool-btn"
						class:active={activeTool === 'arrange'}
						aria-pressed={activeTool === 'arrange'}
						aria-label="Arrange shapes"
						title="Arrange shapes"
						data-tooltip="Arrange shapes"
						onclick={handleToggleArrange}
					>
						<svg aria-hidden="true" viewBox="0 0 24 24">
							<path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
							<path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2" />
							<path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8" />
							<path
								d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-6-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"
							/>
						</svg>
					</button>
					<button
						type="button"
						id="eraserToggle"
						data-testid="eraser-toggle"
						class="tool-btn"
						class:active={activeTool === 'erase'}
						aria-pressed={activeTool === 'erase'}
						aria-label="Eraser"
						title="Eraser"
						data-tooltip="Eraser"
						onclick={handleToggleEraser}
					>
						<svg aria-hidden="true" viewBox="0 0 24 24">
							<path
								d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"
							/>
							<path d="M22 21H7" />
							<path d="m5 11 9 9" />
						</svg>
					</button>
					<button
						type="button"
						class="zoom-btn"
						onclick={handleZoomOut}
						disabled={zoomLevel <= ZOOM_MIN}
						aria-label="Zoom out"
						title="Zoom out"
						data-tooltip="Zoom out"
					>
						-
					</button>
					<button
						id="panToggle"
						type="button"
						class="zoom-btn"
						class:active={panEnabled}
						aria-pressed={panEnabled}
						aria-label="Pan"
						title="Pan"
						data-tooltip="Pan"
						onclick={handleTogglePan}
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							width="16"
							height="16"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M5 9l-3 3 3 3" />
							<path d="M9 5l3-3 3 3" />
							<path d="M15 19l-3 3-3-3" />
							<path d="M19 9l3 3-3 3" />
							<path d="M2 12h20" />
							<path d="M12 2v20" />
						</svg>
					</button>
					<button
						type="button"
						class="zoom-btn"
						onclick={handleZoomIn}
						disabled={zoomLevel >= ZOOM_MAX}
						aria-label="Zoom in"
						title="Zoom in"
						data-tooltip="Zoom in"
					>
						+
					</button>
				</div>
			</div>
		</section>

		<aside class="dictionary-panel" aria-label="Dictionary and diagnostics">
			<div class="panel-tabs">
				<button
					type="button"
					class="panel-tab-button"
					class:active={rootTab === 'dictionary'}
					onclick={() => (rootTab = 'dictionary')}
				>
					Dictionary
				</button>
				<button
					type="button"
					class="panel-tab-button"
					class:active={rootTab === 'shapes'}
					onclick={() => (rootTab = 'shapes')}
				>
					Shapes
				</button>
				<button
					type="button"
					class="panel-tab-button"
					class:active={rootTab === 'diagnostic'}
					onclick={() => (rootTab = 'diagnostic')}
				>
					Diagnostic
				</button>
			</div>

			<section id="dictionaryRootPanel" hidden={rootTab !== 'dictionary'}>
				<DictionaryReference {dictionary} />
			</section>

			<section id="shapesRootPanel" hidden={rootTab !== 'shapes'}>
				<ShapePalette
					library={shapeLibrary}
					{armedShapeId}
					{selected}
					onDragStart={beginShapeDrag}
					onChange={updateSelectedTransform}
					onCommitTransform={pushHistory}
					onCommit={handleCommitSelected}
					onRemove={() => selectedPlacementId && deletePlacement(selectedPlacementId)}
				/>
			</section>

			<section id="diagnosticRootPanel" hidden={rootTab !== 'diagnostic'}>
				<Diagnostics {diagnostics} />
			</section>
		</aside>
	</main>

	{#if dragPreview}
		<div
			class="shape-drag-overlay"
			style="left: {dragPreview.x}px; top: {dragPreview.y}px;"
			aria-hidden="true"
		>
			<svg viewBox="0 0 100 100" focusable="false">
				{#each dragPreview.item.baseStrokes as stroke, strokeIndex (strokeIndex)}
					{@const points = shapePreviewPoints(stroke)}
					{#if points}
						<polyline {points}></polyline>
					{/if}
				{/each}
			</svg>
		</div>
	{/if}

	<footer class="app-footer">
		<p>
			Unofficial fan-made spell diagram simulator inspired by Witch Hat Atelier. This project is not
			affiliated with, endorsed by, or sponsored by the official creators, publishers, licensors, or
			production partners.
		</p>
		<p>
			Witch Hat Atelier and related names, artwork, symbols, and trademarks belong to their
			respective rights holders. The sigils, signs, and spell effects here are partial fan
			references and programming-language interpretations for learning and experimentation.
		</p>
	</footer>
</div>
