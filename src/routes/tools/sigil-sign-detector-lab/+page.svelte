<script lang="ts">
	import type { Dictionary, SigilEntry, Stroke } from '$lib/types.js';

	import Canvas from '$canvas/Canvas.svelte';
	import { paperEntity } from '$canvas/entities/paperEntity.js';
	import { referenceOverlayEntity } from '$canvas/entities/referenceOverlayEntity.js';
	import type { StrokeEntity } from '$canvas/entities/strokeEntity.js';
	import { createScene } from '$canvas/scene.svelte.js';
	import { createDrawTool } from '$canvas/tools/drawTool.svelte.js';
	import { CONFIG } from '$lib/config.js';
	import { writeJson } from '$lib/debug/debugOverlay.js';
	import { loadDictionary } from '$lib/dictionary/dictionaryLoader.js';
	import { setStatus } from '$lib/state.svelte';
	import { disposeSigilAnalysis, requestSigilAnalysis } from '$lib/ui/sigilAnalysisClient.js';
	import { type AnalysisResult, percent, statusClass, statusLabel } from '$lib/ui/sigilDetector.js';
	import { roundDeep } from '$lib/utils/json.js';
	import { onDestroy } from 'svelte';
	import MatchCard from './MatchCard.svelte';

	let dictionary = $state<Dictionary | null>(null);
	// Plain (non-reactive) copy of the dictionary for cloning to the analysis
	// worker; a $state proxy can't be structured-cloned across postMessage.
	let workerDictionary: Dictionary | null = null;
	let mode = $state('all');
	let referenceId = $state('');
	let paperOverlay = $state(true);
	let analysis = $state<AnalysisResult>({
		cleanedStrokes: [],
		candidate: null,
		recognition: null,
		matches: []
	});
	const CANVAS_SIZE = 760;

	const scene = createScene([
		paperEntity(),
		referenceOverlayEntity({
			enabled: () => paperOverlay,
			traceTemplate: () => selectedReferenceEntry()?.strokeTemplate,
			candidate: () => analysis.candidate,
			matchTemplate: () => analysis.matches[0]?.entry.strokeTemplate,
			matchRotationDeg: () => analysis.matches[0]?.templateMatch.rotationDeg ?? 0,
			recognized: () => Boolean(analysis.recognition?.recognized)
		})
	]);
	const draw = createDrawTool(scene);

	const committedStrokes = $derived(
		scene
			.getEntities()
			.filter((e): e is StrokeEntity => 'stroke' in e)
			.map((e) => e.stroke)
	);

	let recognitionPre = $state<HTMLPreElement | null>(null);
	let candidatePre = $state<HTMLPreElement | null>(null);

	const recognition = $derived(analysis.recognition);
	const bestMatch = $derived(analysis.matches[0]?.templateMatch ?? null);
	const recognized = $derived(Boolean(recognition?.recognized));
	const overlayEntries = $derived(
		(dictionary?.sigils ?? []).filter((entry) => entry.strokeTemplate?.strokes?.length)
	);

	const recognitionJson = $derived(roundDeep(recognition ?? { recognized: false }));
	const candidateJson = $derived(
		roundDeep({
			candidate: analysis.candidate ? { ...analysis.candidate, strokes: undefined } : null,
			topMatches: analysis.matches.slice(0, 8).map(({ kind, entry, templateMatch }) => ({
				kind,
				id: entry.id,
				displayName: entry.displayName,
				confidence: templateMatch.confidence,
				inkScore: templateMatch.inkScore,
				softDiceScore: templateMatch.softDiceScore,
				candidateExplainedRatio: templateMatch.candidateExplainedRatio,
				templateCoveredRatio: templateMatch.templateCoveredRatio,
				unexplainedInkRatio: templateMatch.unexplainedInkRatio,
				contaminationRisk: templateMatch.contaminationRisk,
				rotationDeg: templateMatch.rotationDeg
			}))
		})
	);

	$effect(() => {
		if (recognitionPre) {
			writeJson(recognitionPre, recognitionJson);
		}
		if (candidatePre) {
			writeJson(candidatePre, candidateJson);
		}
	});

	// `analysis` is only ever written here, from the worker's result (or the
	// synchronous fallback). Reading it back inside the requesting effect would
	// make that effect depend on the state it writes and loop forever.
	function applyResult(result: AnalysisResult): void {
		analysis = result;

		const recStatus =
			result.recognition?.recognitionStatus ?? (result.matches.length ? 'unknown' : 'valid');
		setStatus(
			result.matches.length ? statusLabel(recStatus) : 'Ready',
			statusClass(recStatus, Boolean(result.recognition?.recognized))
		);
	}

	// Re-analyze whenever committed strokes, the in-progress preview, mode, or
	// dictionary change. Analysis runs on a worker via a latest-wins channel, so
	// this can fire on every pointer sample without ever blocking the draw loop:
	// stale frames are dropped and only the freshest result is applied.
	$effect(() => {
		if (!dictionary || !workerDictionary) return;
		const activeMode = mode;
		const currentStroke = draw.getCurrentStroke();
		const committed = committedStrokes;
		const allStrokes = currentStroke ? [...committed, currentStroke] : [...committed];

		// Snapshot to plain data: $state proxies can't be cloned to the worker.
		requestSigilAnalysis(
			workerDictionary,
			CONFIG,
			$state.snapshot(allStrokes) as Stroke[],
			activeMode,
			CANVAS_SIZE,
			CANVAS_SIZE,
			applyResult
		);
	});

	onDestroy(disposeSigilAnalysis);

	function handleUndo() {
		scene.undo();
	}

	function handleClear() {
		scene.clear();
	}

	function selectedReferenceEntry(): SigilEntry | null {
		if (!paperOverlay || !referenceId || !dictionary?.sigils?.length) {
			return null;
		}
		return dictionary.sigils.find((entry) => entry.id === referenceId) ?? null;
	}

	$effect(() => {
		setStatus('Loading', '');
		let cancelled = false;
		loadDictionary()
			.then((loaded) => {
				if (cancelled) {
					return;
				}
				dictionary = loaded;
				workerDictionary = loaded;
			})
			.catch((error) => {
				if (!cancelled) {
					console.error(error);
					setStatus('Dictionary load failed', 'invalid');
				}
			});
		return () => {
			cancelled = true;
		};
	});
</script>

<svelte:head>
	<title>Sigil/Sign Detector Lab</title>
</svelte:head>

<main class="workspace maker-workspace detector-lab-workspace">
	<section class="canvas-panel maker-canvas-panel">
		<div class="toolbar detector-lab-toolbar">
			<button type="button" disabled={!scene.canUndo()} onclick={handleUndo}>Undo</button>
			<button type="button" onclick={handleClear}>Clear</button>
			<select class="select-control" bind:value={mode}>
				<option value="all">Sigils + Signs</option>
				<option value="sigils">Sigils</option>
				<option value="signs">Signs</option>
			</select>
			<select class="select-control" bind:value={referenceId} disabled={!paperOverlay}>
				<option value="">No trace reference</option>
				{#each overlayEntries as entry (entry.id)}
					<option value={entry.id}>{entry.displayName ?? entry.id}</option>
				{/each}
			</select>
			<label class="toggle">
				<input type="checkbox" bind:checked={paperOverlay} />
				<span>Paper Overlay</span>
			</label>
		</div>
		<Canvas {scene} controller={draw} width={CANVAS_SIZE} height={CANVAS_SIZE} />
	</section>

	<aside class="side-panel detector-lab-side-panel">
		<section class="diagnostic-block">
			<h2>Decision</h2>
			<div class="detector-lab-decision-grid">
				<span>Recognized</span><strong>{recognized}</strong>
				<span>Kind</span><strong>{recognition?.kind ?? 'none'}</strong>
				<span>ID</span><strong>{recognition?.id ?? 'none'}</strong>
				<span>Confidence</span><strong>{percent(recognition?.confidence)}</strong>
				<span>Template</span><strong>{percent(bestMatch?.confidence)}</strong>
				<span>Ink</span><strong>{percent(bestMatch?.inkScore)}</strong>
				<span>Explained</span><strong>{percent(bestMatch?.candidateExplainedRatio)}</strong>
				<span>Rotation</span><strong>{Math.round(bestMatch?.rotationDeg ?? 0)} deg</strong>
			</div>
		</section>

		<section class="diagnostic-block">
			<h2>Top Matches</h2>
			<div class="detector-match-list">
				{#if !analysis.matches.length}
					<p class="reference-note">Draw one sigil or sign.</p>
				{:else}
					{#each analysis.matches.slice(0, 8) as match, index (match.entry.id)}
						<MatchCard {match} best={index === 0} />
					{/each}
				{/if}
			</div>
		</section>

		<section class="diagnostic-block">
			<h2>Recognition JSON</h2>
			<pre bind:this={recognitionPre} class="diagnostic-output detector-lab-small-output"></pre>
		</section>

		<section class="diagnostic-block">
			<h2>Candidate JSON</h2>
			<pre bind:this={candidatePre} class="diagnostic-output detector-lab-small-output"></pre>
		</section>
	</aside>
</main>

<style>
	.detector-lab-workspace {
		grid-template-columns: minmax(520px, 1fr) minmax(360px, 0.48fr);
	}

	.detector-lab-toolbar {
		flex-wrap: wrap;
	}

	.detector-lab-side-panel {
		display: grid;
		gap: 14px;
		align-content: start;
	}

	.detector-lab-decision-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 7px 14px;
		font-size: 14px;
	}

	.detector-lab-decision-grid span {
		color: var(--muted-ink);
	}

	.detector-lab-decision-grid strong {
		color: var(--teal);
		font-variant-numeric: tabular-nums;
	}

	.detector-lab-small-output {
		max-height: 180px;
	}

	.detector-match-list {
		display: grid;
		gap: 8px;
		max-height: 32vh;
		overflow: auto;
		scrollbar-gutter: stable;
	}

	.reference-note {
		border: 1px solid rgba(36, 27, 22, 0.14);
		border-radius: 6px;
		padding: 10px;
		color: var(--muted-ink);
		background: rgba(255, 251, 233, 0.82);
		font-size: 13px;
		line-height: 1.4;
		flex: 1 1 auto;
	}
</style>
