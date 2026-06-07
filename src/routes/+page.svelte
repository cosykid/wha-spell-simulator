<script lang="ts">
	import { resolve } from '$app/paths';
	import type { RecognitionExample } from '$lib/parser/shapeMatcher.js';
	import type { ClassifiedDrawing, Dictionary, RingInfo, SpellIR } from '$lib/types.js';
	import { onMount } from 'svelte';

	import { loadRecognitionAssets } from '$lib/api/recognitionAssets.js';
	import { compileSpell } from '$lib/compiler/spellBuilder.js';
	import { CONFIG } from '$lib/config.js';
	import { buildDiagnosticState } from '$lib/debug/diagnosticState.js';
	import { loadDictionary } from '$lib/dictionary/dictionaryLoader.js';
	import { DrawingCapture } from '$lib/input/drawingCapture.js';
	import { createStrokeStore } from '$lib/input/strokeStore.js';
	import { classifyDrawingAsync } from '$lib/parser/drawingClassifier.js';
	import { disposeRecognitionPool } from '$lib/parser/recognitionPool.js';
	import { CanvasRenderer } from '$lib/renderer/canvasRenderer.js';
	import { setupCanvasSizing } from '$lib/ui/canvasSizing.js';
	import { computeSummary, INITIAL_SUMMARY } from '$lib/ui/spellSummary.js';

	import ControlPanel from '$lib/components/ControlPanel.svelte';
	import Diagnostics from '$lib/components/Diagnostics.svelte';
	import DictionaryReference from '$lib/components/DictionaryReference.svelte';

	const ZOOM_MIN = 0.5;
	const ZOOM_MAX = 3;
	const ZOOM_STEP = 0.25;

	// Reactive UI state.
	let dictionary = $state<Dictionary | null>(null);
	let recognitionExamples = $state<RecognitionExample[]>([]);
	let summary = $state<typeof INITIAL_SUMMARY>({ ...INITIAL_SUMMARY });
	let diagnostics = $state<{ ast: unknown; ir: unknown; parser: unknown }>({
		ast: null,
		ir: null,
		parser: null
	});
	let showGuides = $state(true);
	let showDiagnostics = $state(false);
	// True once drawing capture has attached its pointer listeners. The status
	// text can leave "Loading" before this (a resize-triggered recompute), so this
	// is the authoritative "the canvas accepts strokes now" signal.
	let inputReady = $state(false);
	let rootTab = $state('dictionary');
	let zoomLevel = $state(1);

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
	let renderer: CanvasRenderer | null = null;
	let capture: DrawingCapture | null = null;
	let pipeline: ClassifiedDrawing | null = null;
	let spellIR: SpellIR | null = null;
	let previousRing: RingInfo | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let rafId: number | null = null;
	let recomputeTimer: ReturnType<typeof setTimeout> | null = null;

	// Plain (non-reactive) snapshots of the recognition inputs, posted to the
	// classifier/recognition workers. `$state` proxies are not structured-cloneable,
	// so posting the reactive values directly throws DataCloneError and silently
	// drops every recognition onto the main thread. Snapshot once per load (not per
	// recompute) so the references stay stable and the workers keep their cached
	// dictionary instead of re-initializing on every stroke.
	let dictionarySnapshot: Dictionary | null = null;
	let recognitionExamplesSnapshot: RecognitionExample[] = [];

	function buildDiagnostics() {
		const state = buildDiagnosticState({
			rawStrokes: store.peekStrokes(),
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

	async function refreshRecognitionAssets() {
		const recognitionAssets = await loadRecognitionAssets();
		recognitionExamples = recognitionAssets.recognitionExamples;
		recognitionExamplesSnapshot = $state.snapshot(recognitionExamples) as RecognitionExample[];
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

		// Recognition is fanned out across a worker pool, so this is async. Guard with
		// a sequence token: rapid strokes can overlap, and only the newest result
		// should win. previousRing is read synchronously here, before the await.
		const seq = ++recomputeSeq;
		let result: ClassifiedDrawing;
		try {
			result = await classifyDrawingAsync({
				strokes: store.getStrokes(),
				previousRing,
				canvasWidth: glyphCanvas.width,
				canvasHeight: glyphCanvas.height,
				dictionary: dictionarySnapshot,
				config: CONFIG,
				recognitionExamples: recognitionExamplesSnapshot
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
		summary = computeSummary({ store, pipeline, spellIR, showGuides });
		capture?.setLocked(summary.inputLocked);
		diagnostics = buildDiagnostics();
	}

	function animationFrame(timestamp: number) {
		const strokes = store.peekStrokes();
		renderer!.renderGlyph({
			strokes,
			currentStroke: capture!.getCurrentStrokeView(),
			pipeline,
			showGuides,
			showDebug: showDiagnostics
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
		cancelActiveRecognition();
		store.undo();
		previousRing = null;
		void recompute();
	}

	function handleRedo() {
		cancelActiveRecognition();
		store.redo();
		previousRing = null;
		void recompute();
	}

	function handleClear() {
		cancelActiveRecognition();
		store.clear();
		previousRing = null;
		void recompute();
	}

	function handleToggleGuides() {
		// Guides only affect the canvas hint visibility and guide rendering;
		// refresh the summary without re-running the parser pipeline.
		if (dictionary) {
			summary = computeSummary({ store, pipeline, spellIR, showGuides });
		}
	}

	// Mirror the original `body.diagnostics-visible` toggle the debug CSS keys off.
	$effect(() => {
		document.body.classList.toggle('diagnostics-visible', showDiagnostics);
		return () => document.body.classList.remove('diagnostics-visible');
	});

	onMount(() => {
		renderer = new CanvasRenderer({ glyphCanvas, effectCanvas, config: CONFIG });
		capture = new DrawingCapture(glyphCanvas, store, CONFIG, {
			onStart: cancelActiveRecognition,
			onCommit: () => void recompute()
		});
		resizeObserver = setupCanvasSizing({
			elements: { canvasShell, glyphCanvas, effectCanvas },
			store,
			onCanvasResized: () => {
				previousRing = null;
				scheduleRecompute(60);
			}
		});

		let cancelled = false;
		(async () => {
			try {
				dictionary = await loadDictionary();
				dictionarySnapshot = $state.snapshot(dictionary) as Dictionary;
				await refreshRecognitionAssets();
				capture.enable();
				inputReady = true;
				void recompute();
				if (!cancelled) {
					rafId = requestAnimationFrame(animationFrame);
				}
			} catch (error) {
				console.error(error);
				summary = { ...summary, statusText: 'Dictionary load failed', statusClass: 'invalid' };
			}
		})();

		function handleKeydown(event: KeyboardEvent) {
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
			inputReady = false;
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
	<header class="app-header">
		<div>
			<p class="eyebrow">Glyph Compiler</p>
			<h1>Witch Hat Atelier Spell Simulator</h1>
		</div>
		<div class="header-actions">
			<a class="header-link" href={resolve('/tools')}>Tools</a>
			<a
				class="header-link"
				href="https://github.com/cosykid/wha-spell-simulator"
				target="_blank"
				rel="noreferrer">GitHub</a
			>
		</div>
	</header>

	<main class="workspace">
		<ControlPanel
			{summary}
			bind:showGuides
			bind:showDiagnostics
			onUndo={handleUndo}
			onRedo={handleRedo}
			onClear={handleClear}
			onToggleGuides={handleToggleGuides}
		/>

		<section class="canvas-panel" aria-label="Spell drawing surface">
			<div
				class="canvas-shell"
				data-testid="canvas-shell"
				bind:this={canvasShell}
				class:portal-active={summary.portalActive}
			>
				<p
					class="canvas-hint"
					id="canvasHint"
					data-testid="canvas-hint"
					class:hidden={summary.hintHidden}
				>
					Draw an open spell ring. Place sigils in the center and signs around them. When everything
					is ready, seal the circle to awaken the spell.
				</p>
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
						class:locked={summary.inputLocked}
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
			</div>
			<div class="canvas-controls">
				<button
					type="button"
					class="zoom-btn"
					onclick={handleZoomOut}
					disabled={zoomLevel <= ZOOM_MIN}
					aria-label="Zoom out"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg
					>
					<span>Zoom Out</span>
				</button>
				<span class="zoom-level-display">{Math.round(zoomLevel * 100)}%</span>
				<button
					type="button"
					class="zoom-btn"
					onclick={handleZoomIn}
					disabled={zoomLevel >= ZOOM_MAX}
					aria-label="Zoom in"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"
						></line></svg
					>
					<span>Zoom In</span>
				</button>
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
					class:active={rootTab === 'diagnostic'}
					onclick={() => (rootTab = 'diagnostic')}
				>
					Diagnostic
				</button>
			</div>

			<section id="dictionaryRootPanel" hidden={rootTab !== 'dictionary'}>
				<DictionaryReference {dictionary} />
			</section>

			<section id="diagnosticRootPanel" hidden={rootTab !== 'diagnostic'}>
				<Diagnostics {diagnostics} />
			</section>
		</aside>
	</main>

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
