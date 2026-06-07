<script lang="ts">
	import type { Dictionary, SigilEntry, StrokeTemplate } from '$lib/types.js';

	import Canvas from '$canvas/Canvas.svelte';
	import { CONFIG } from '$lib/config.js';
	import { writeJson } from '$lib/debug/debugOverlay.js';
	import { loadDictionary } from '$lib/dictionary/dictionaryLoader.js';
	import { setStatus } from '$lib/state.svelte';
	import { paperEntity } from '$canvas/entities/paperEntity.js';
	import { referenceOverlayEntity } from '$canvas/entities/referenceOverlayEntity.js';
	import type { StrokeEntity } from '$canvas/entities/strokeEntity.js';
	import { createScene } from '$canvas/scene.svelte.js';
	import { createDrawTool } from '$canvas/tools/drawTool.svelte.js';
	import {
		analyzeStrokes,
		normalizedTemplateStrokes,
		percent,
		statusClass,
		statusLabel
	} from '$lib/ui/sigilDetector.js';
	import { roundDeep } from '$lib/utils/json.js';

	let dictionary = $state<Dictionary | null>(null);
	let mode = $state('all');
	let referenceId = $state('');
	let paperOverlay = $state(true);
	let analysis = $state<ReturnType<typeof analyzeStrokes>>({
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

	// Re-analyze whenever committed strokes, the in-progress preview, mode, or dictionary change.
	$effect(() => {
		if (!dictionary) return;

		const currentStroke = draw.getCurrentStroke();
		const allStrokes = currentStroke ? [...committedStrokes, currentStroke] : [...committedStrokes];

		// Use the local result for the status below: reading back from `analysis` here
		// would make this effect depend on the state it just wrote and loop forever.
		const result = analyzeStrokes({
			strokes: allStrokes,
			dictionary,
			mode,
			canvasWidth: CANVAS_SIZE,
			canvasHeight: CANVAS_SIZE,
			config: CONFIG
		});
		analysis = result;

		const recStatus =
			result.recognition?.recognitionStatus ?? (result.matches.length ? 'unknown' : 'valid');
		setStatus(
			result.matches.length ? statusLabel(recStatus) : 'Ready',
			statusClass(recStatus, Boolean(result.recognition?.recognized))
		);
	});

	function previewPolylines(strokeTemplate: StrokeTemplate | undefined) {
		return normalizedTemplateStrokes(strokeTemplate)
			.map((stroke) =>
				stroke
					.map(
						(point) =>
							`${Math.round((8 + point.x * 84) * 10) / 10},${Math.round((8 + point.y * 84) * 10) / 10}`
					)
					.join(' ')
			)
			.filter((points) => points.length > 0);
	}

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
		<Canvas {scene} controller={draw} width={CANVAS_SIZE} height={CANVAS_SIZE} maxWidth={820} />
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
						{@const polylines = previewPolylines(match.entry.strokeTemplate)}
						<article class="reference-card detector-match-card {index === 0 ? 'best' : ''}">
							{#if polylines.length}
								<div class="reference-preview detector-match-preview" aria-hidden="true">
									<svg viewBox="0 0 100 100" role="img" focusable="false">
										{#each polylines as points, i (i)}
											<polyline {points}></polyline>
										{/each}
									</svg>
								</div>
							{/if}
							<div class="detector-match-body">
								<div class="reference-card-header">
									<strong>{match.entry.displayName ?? match.entry.id}</strong>
									<span>{match.kind}</span>
								</div>
								<div class="detector-score-bar">
									<span style="width: {Math.round(match.templateMatch.confidence * 100)}%"></span>
								</div>
								<dl>
									<div>
										<dt>Template</dt>
										<dd>{percent(match.templateMatch.confidence)}</dd>
									</div>
									<div>
										<dt>Ink</dt>
										<dd>{percent(match.templateMatch.inkScore)}</dd>
									</div>
									<div>
										<dt>Explained</dt>
										<dd>{percent(match.templateMatch.candidateExplainedRatio)}</dd>
									</div>
									<div>
										<dt>Covered</dt>
										<dd>{percent(match.templateMatch.templateCoveredRatio)}</dd>
									</div>
									<div>
										<dt>Rotation</dt>
										<dd>{Math.round(match.templateMatch.rotationDeg)} deg</dd>
									</div>
								</dl>
							</div>
						</article>
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
