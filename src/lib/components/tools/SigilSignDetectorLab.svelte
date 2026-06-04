<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import type { Dictionary, Point, SigilEntry, StrokeTemplate } from '$lib/types.js';

	import { CONFIG } from '$lib/config.js';
	import { loadDictionary } from '$lib/dictionary/dictionaryLoader.js';
	import { DrawingCapture } from '$lib/input/drawingCapture.js';
	import { createStrokeStore } from '$lib/input/strokeStore.js';
	import { writeJson } from '$lib/debug/debugOverlay.js';
	import { drawStrokes } from '$lib/renderer/glyphOverlayRenderer.js';
	import { drawPaper } from '$lib/renderer/paperRenderer.js';
	import { roundDeep } from '$lib/utils/json.js';
	import {
		analyzeStrokes,
		normalizedTemplateStrokes,
		percent,
		rotateTemplatePoint,
		statusClass,
		statusLabel
	} from '$lib/ui/sigilDetector.js';

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
	let strokeCount = $state(0);
	let status = $state({ text: 'Loading', className: '' });

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;
	const store = createStrokeStore();
	let capture: DrawingCapture | null = null;

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

	type DetectorMatch = ReturnType<typeof analyzeStrokes>['matches'][number];
	type DetectorCandidate = NonNullable<ReturnType<typeof analyzeStrokes>['candidate']>;

	function setStatus(text: string, className = '') {
		status = { text, className };
	}

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

	function analyze() {
		if (!dictionary) {
			return;
		}

		const currentStroke = capture?.getCurrentStroke();
		const rawStrokes = currentStroke ? [...store.getStrokes(), currentStroke] : store.getStrokes();
		analysis = analyzeStrokes({
			strokes: rawStrokes,
			dictionary,
			mode,
			canvasWidth: canvas.width,
			canvasHeight: canvas.height,
			config: CONFIG
		});
		strokeCount = store.count();

		const recStatus =
			analysis.recognition?.recognitionStatus ?? (analysis.matches.length ? 'unknown' : 'valid');
		setStatus(
			analysis.matches.length ? statusLabel(recStatus) : 'Ready',
			statusClass(recStatus, Boolean(analysis.recognition?.recognized))
		);
	}

	function handleUndo() {
		store.undo();
		analyze();
	}

	function handleClear() {
		store.clear();
		analyze();
	}

	function selectedReferenceEntry(): SigilEntry | null {
		if (!paperOverlay || !referenceId || !dictionary?.sigils?.length) {
			return null;
		}
		return dictionary.sigils.find((entry) => entry.id === referenceId) ?? null;
	}

	function templatePointToCanvas(point: Point, candidate: DetectorCandidate, rotationDeg: number) {
		const rotated = rotateTemplatePoint(point, rotationDeg);
		const scale = Math.max(candidate.bounds.width, candidate.bounds.height, 1);
		return {
			x: candidate.center.x + (rotated.x - 0.5) * scale,
			y: candidate.center.y + (rotated.y - 0.5) * scale
		};
	}

	function drawReferenceOverlay(
		candidate: DetectorCandidate | null,
		match: DetectorMatch | undefined
	) {
		const strokes = normalizedTemplateStrokes(match?.entry?.strokeTemplate);
		if (!candidate || !strokes.length || !ctx) {
			return;
		}

		const rotationDeg = match?.templateMatch?.rotationDeg ?? 0;

		ctx.save();
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.lineWidth = 6;
		ctx.strokeStyle = 'rgba(255, 247, 219, 0.92)';
		ctx.shadowColor = 'rgba(36, 27, 22, 0.42)';
		ctx.shadowBlur = 6;

		for (const stroke of strokes) {
			if (!stroke.length) {
				continue;
			}
			ctx.beginPath();
			const first = templatePointToCanvas(stroke[0], candidate, rotationDeg);
			ctx.moveTo(first.x, first.y);
			for (let index = 1; index < stroke.length; index += 1) {
				const point = templatePointToCanvas(stroke[index], candidate, rotationDeg);
				ctx.lineTo(point.x, point.y);
			}
			ctx.stroke();
		}

		ctx.shadowBlur = 0;
		ctx.lineWidth = 2.25;
		ctx.strokeStyle = 'rgba(31, 111, 115, 0.95)';

		for (const stroke of strokes) {
			if (!stroke.length) {
				continue;
			}
			ctx.beginPath();
			const first = templatePointToCanvas(stroke[0], candidate, rotationDeg);
			ctx.moveTo(first.x, first.y);
			for (let index = 1; index < stroke.length; index += 1) {
				const point = templatePointToCanvas(stroke[index], candidate, rotationDeg);
				ctx.lineTo(point.x, point.y);
			}
			ctx.stroke();
		}

		ctx.restore();
	}

	function drawTraceReferenceOverlay(entry: SigilEntry | null) {
		const strokes = normalizedTemplateStrokes(entry?.strokeTemplate);
		if (!strokes.length || !ctx) {
			return;
		}

		const center = { x: canvas.width / 2, y: canvas.height / 2 };
		const scale = Math.min(canvas.width, canvas.height) * 0.52;

		ctx.save();
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.lineWidth = 10;
		ctx.strokeStyle = 'rgba(255, 247, 219, 0.72)';
		ctx.shadowColor = 'rgba(36, 27, 22, 0.2)';
		ctx.shadowBlur = 8;

		for (const stroke of strokes) {
			if (!stroke.length) {
				continue;
			}
			ctx.beginPath();
			ctx.moveTo(center.x + (stroke[0].x - 0.5) * scale, center.y + (stroke[0].y - 0.5) * scale);
			for (let index = 1; index < stroke.length; index += 1) {
				ctx.lineTo(
					center.x + (stroke[index].x - 0.5) * scale,
					center.y + (stroke[index].y - 0.5) * scale
				);
			}
			ctx.stroke();
		}

		ctx.shadowBlur = 0;
		ctx.lineWidth = 3;
		ctx.strokeStyle = 'rgba(184, 69, 49, 0.6)';
		ctx.setLineDash([10, 8]);

		for (const stroke of strokes) {
			if (!stroke.length) {
				continue;
			}
			ctx.beginPath();
			ctx.moveTo(center.x + (stroke[0].x - 0.5) * scale, center.y + (stroke[0].y - 0.5) * scale);
			for (let index = 1; index < stroke.length; index += 1) {
				ctx.lineTo(
					center.x + (stroke[index].x - 0.5) * scale,
					center.y + (stroke[index].y - 0.5) * scale
				);
			}
			ctx.stroke();
		}

		ctx.restore();
	}

	onMount(() => {
		ctx = canvas.getContext('2d');
		let rafId: number | null = null;

		function render() {
			if (!ctx) {
				return;
			}
			drawPaper(ctx, canvas.width, canvas.height);
			if (paperOverlay) {
				drawTraceReferenceOverlay(selectedReferenceEntry());
			}
			drawStrokes(ctx, store.getStrokes(), capture?.getCurrentStroke(), CONFIG);

			if (paperOverlay) {
				drawReferenceOverlay(analysis.candidate, analysis.matches[0]);
			}

			if (paperOverlay && analysis.candidate?.bounds && ctx) {
				const { bounds } = analysis.candidate;
				ctx.save();
				ctx.strokeStyle = analysis.recognition?.recognized
					? 'rgba(31, 111, 115, 0.72)'
					: 'rgba(184, 69, 49, 0.62)';
				ctx.lineWidth = 2;
				ctx.setLineDash([8, 6]);
				ctx.strokeRect(bounds.minX - 8, bounds.minY - 8, bounds.width + 16, bounds.height + 16);
				ctx.restore();
			}

			rafId = requestAnimationFrame(render);
		}

		capture = new DrawingCapture(canvas, store, CONFIG, {
			onPreview: analyze,
			onCommit: analyze
		});

		let cancelled = false;
		(async () => {
			try {
				dictionary = await loadDictionary();
				capture.enable();
				analyze();
				setStatus('Ready');
				rafId = requestAnimationFrame(render);
			} catch (error) {
				if (!cancelled) {
					console.error(error);
					setStatus('Dictionary load failed', 'invalid');
				}
			}
		})();

		return () => {
			cancelled = true;
			if (rafId) {
				cancelAnimationFrame(rafId);
			}
			capture?.disable();
		};
	});
</script>

<svelte:head>
	<title>Sigil/Sign Detector Lab</title>
</svelte:head>

<div class="app-shell">
	<header class="app-header">
		<div>
			<p class="eyebrow">Detector Tool</p>
			<h1>Sigil/Sign Detector Lab</h1>
		</div>
		<div class="header-actions">
			<a class="header-link" href="{base}/tools">Tools</a>
			<div class="status-pill {status.className}">{status.text}</div>
		</div>
	</header>

	<main class="workspace maker-workspace detector-lab-workspace">
		<section class="canvas-panel maker-canvas-panel">
			<div class="toolbar detector-lab-toolbar">
				<button type="button" disabled={strokeCount === 0} onclick={handleUndo}>Undo</button>
				<button type="button" onclick={handleClear}>Clear</button>
				<select class="select-control" bind:value={mode} onchange={analyze}>
					<option value="all">Sigils + Signs</option>
					<option value="sigils">Sigils</option>
					<option value="signs">Signs</option>
				</select>
				<select
					class="select-control"
					bind:value={referenceId}
					disabled={!paperOverlay}
					onchange={analyze}
				>
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
			<div class="detector-lab-canvas-shell">
				<canvas bind:this={canvas} width="760" height="760"></canvas>
			</div>
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
											{#each polylines as points}
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
</div>
