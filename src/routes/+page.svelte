<script lang="ts">
	import { compileSpell } from '$lib/compiler/spellBuilder.js';
	import ControlPanel from '$lib/components/ControlPanel.svelte';
	import Diagnostics from '$lib/components/Diagnostics.svelte';
	import DictionaryReference from '$lib/components/DictionaryReference.svelte';
	import Header from '$lib/components/Header.svelte';
	import ShapePalette from '$lib/components/ShapePalette.svelte';
	import { CONFIG } from '$lib/config.js';
	import { buildDiagnosticState } from '$lib/debug/diagnosticState.js';
	import { loadDictionary } from '$lib/dictionary/dictionaryLoader.js';
	import { DrawingCapture } from '$lib/input/drawingCapture.js';
	import { EraserController } from '$lib/input/eraserController.js';
	import { PlacementController } from '$lib/input/placementController.js';
	import { createPlacementStore } from '$lib/input/placementStore.js';
	import { bakePlacementToStrokes, placementHandles } from '$lib/input/shapeBaker.js';
	import { buildShapeLibrary, defaultTransformForShape } from '$lib/input/shapeLibrary.js';
	import { eraseSegment } from '$lib/utils/strokeErase.js';
	import { createStrokeStore } from '$lib/input/strokeStore.js';
	import { classifyDrawingAsync } from '$lib/parser/drawingClassifier.js';
	import { disposeRecognitionPool } from '$lib/parser/recognitionPool.js';
	import { CanvasRenderer } from '$lib/renderer/canvasRenderer.js';
	import type {
		ClassifiedDrawing,
		Dictionary,
		Placement,
		PlacementTransform,
		Point,
		RingInfo,
		ShapeItem,
		ShapeLibrary,
		SpellIR,
		Stroke,
		Vector
	} from '$lib/types.js';
	import { setupCanvasSizing } from '$lib/ui/canvasSizing.js';
	import { computeSummary, INITIAL_SUMMARY } from '$lib/ui/spellSummary.js';
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
	let diagnostics = $state<{ ast: unknown; ir: unknown; parser: unknown }>({
		ast: null,
		ir: null,
		parser: null
	});
	let showGuides = $state(true);
	let showDiagnostics = $state(false);
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
	let selected = $state<{ kind: string; sourceId: string; transform: PlacementTransform } | null>(
		null
	);
	let draggedShape: ShapeItem | null = null;
	let dragPreview = $state<{ item: ShapeItem; x: number; y: number } | null>(null);
	let shapeDragPointerId: number | null = null;

	function handleZoomIn() {
		zoomLevel = Math.min(ZOOM_MAX, zoomLevel + ZOOM_STEP);
	}

	function handleZoomOut() {
		zoomLevel = Math.max(ZOOM_MIN, zoomLevel - ZOOM_STEP);
	}

	// Bound DOM nodes.
	let glyphCanvas: HTMLCanvasElement;
	let effectCanvas: HTMLCanvasElement;
	let canvasShell: HTMLDivElement;

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
	let resizeObserver: ResizeObserver | null = null;
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
				JSON.stringify({ showGuides, showDiagnostics, arrangeShapes: activeTool === 'arrange' })
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
		return {
			ast: state.glyphAST,
			ir: state.spellIR,
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

	async function recompute() {
		if (!dictionary || !dictionarySnapshot) {
			return;
		}

		// Freehand strokes and any baked placements are classified together, so the
		// editable shapes contribute to ring/sigil detection just like hand-drawn ink.
		strokes = mergedStrokes();

		// Recognition is fanned out across a worker pool, so this is async. Guard with
		// a sequence token: rapid strokes can overlap, and only the newest result
		// should win. previousRing is read synchronously here, before the await.
		const seq = ++recomputeSeq;
		let result: ClassifiedDrawing;
		try {
			result = await classifyDrawingAsync({
				strokes,
				previousRing,
				canvasWidth: glyphCanvas.width,
				canvasHeight: glyphCanvas.height,
				dictionary: dictionarySnapshot,
				config: CONFIG
			});
		} catch (error) {
			console.error(error);
			return;
		}
		if (seq !== recomputeSeq) {
			return;
		}

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

		renderer!.renderEffect({
			spellIR,
			ring: pipeline?.ring,
			timestamp,
			showGuides
		});
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
		if (!glyphCanvas) {
			return;
		}
		glyphCanvas.style.cursor =
			activeTool === 'arrange'
				? 'default'
				: activeTool === 'erase'
					? eraserCursorCss()
					: 'crosshair';
	}

	function setTool(tool: CanvasTool) {
		activeTool = tool;
		controller?.setActive(tool === 'arrange');
		eraser?.setActive(tool === 'erase');
		// Lock capture immediately rather than waiting for recompute's summary to
		// land; otherwise a fast first gesture in arrange/erase mode would also be
		// captured as a freehand stroke.
		capture?.setLocked(tool !== 'draw' || summary.canvasLocked);
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

	// Keep the canvas cursor in sync with the active tool and re-derive the
	// eraser ring's size after zoom changes resize the canvas's on-screen box.
	$effect(() => {
		void zoomLevel;
		updateCanvasCursor();
	});

	onMount(() => {
		loadTogglePreferences();
		togglePreferencesLoaded = true;

		renderer = new CanvasRenderer({ glyphCanvas, effectCanvas, config: CONFIG });
		capture = new DrawingCapture(glyphCanvas, store, CONFIG, {
			onStart: () => {
				cancelActiveRecognition();
				dismissCanvasHint();
			},
			onCommit: () => {
				pushHistory();
				void recompute();
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
				const result = eraseSegment(store.getStrokes(), from, to, CONFIG.eraser);
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

		rafId = requestAnimationFrame(animationFrame);

		let cancelled = false;
		(async () => {
			try {
				dictionary = await loadDictionary();
				if (cancelled) {
					return;
				}
				dictionarySnapshot = $state.snapshot(dictionary) as Dictionary;
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
			window.removeEventListener('keydown', handleKeydown);
			disposeRecognitionPool();
		};
	});
</script>

<svelte:head>
	<title>Witch Hat Atelier Spell Simulator</title>
</svelte:head>

<div class="app-shell">
	<Header title="Glyph Compiler" eyebrow="Witch Hat Atelier Spell Simulator" />

	<main class="workspace">
		<ControlPanel
			{summary}
			bind:showGuides
			bind:showDiagnostics
			onToggleGuides={handleToggleGuides}
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
					style="transform: scale({zoomLevel});"
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
