<!--
@component
One entry in the detector lab's "Top Matches" list: a template thumbnail, the matched
sigil/sign name, a confidence bar, and the per-metric scores. The top match is flagged `best`.
-->
<script lang="ts">
	import { type AnalysisResult, percent, previewPolylines } from '$lib/ui/sigilDetector.js';

	type Match = AnalysisResult['matches'][number];

	interface Props {
		match: Match;
		best: boolean;
	}

	let { match, best }: Props = $props();

	const polylines = $derived(previewPolylines(match.entry.strokeTemplate));
</script>

<article class="reference-card detector-match-card {best ? 'best' : ''}">
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

<style>
	.detector-match-card {
		display: grid;
		grid-template-columns: 72px minmax(0, 1fr);
		gap: 9px;
		align-items: center;
	}

	.detector-match-card.best {
		border-color: rgba(31, 111, 115, 0.48);
	}

	.detector-match-preview {
		width: 72px;
	}

	.detector-match-body {
		min-width: 0;
	}

	.detector-score-bar {
		height: 7px;
		overflow: hidden;
		border-radius: 999px;
		background: rgba(36, 27, 22, 0.14);
		margin: 7px 0;
	}

	.detector-score-bar span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--teal);
	}
</style>
