<!--
@component
One sample in the review grid: the rendered ink + overlay thumbnail with a short
caption and approve/reject controls. Clicking the thumbnail opens the detail dialog.
-->
<script lang="ts">
	import type { LabelledSample, ReviewStatus } from '$lib/structures/labelledSample.js';
	import SampleSvg from './SampleSvg.svelte';
	import { formatCapturedAt, referenceOverlay, sampleStats } from './renderSample.js';

	interface Props {
		sample: LabelledSample;
		displayName: string;
		showOverlay: boolean;
		/** True while this sample's verdict is being saved; disables the controls. */
		busy: boolean;
		onopen: () => void;
		/** Record a verdict, or clear it again with `null`. */
		onverdict: (status: ReviewStatus | null) => void;
	}

	let { sample, displayName, showOverlay, busy, onopen, onverdict }: Props = $props();

	const stats = $derived(sampleStats(sample));
	const overlayMissing = $derived(referenceOverlay(sample) === null);
	const review = $derived(sample.review);
</script>

<article
	class="sample-card"
	class:approved={review?.status === 'approved'}
	class:rejected={review?.status === 'rejected'}
>
	<button type="button" class="sample-thumb" onclick={onopen} title="Inspect sample">
		<SampleSvg {sample} {showOverlay} />
	</button>
	<div class="sample-caption">
		<span class="sample-name">
			{displayName}
			{#if review}
				<span class="sample-badge {review.status}">{review.status}</span>
			{/if}
		</span>
		<span class="sample-meta">{formatCapturedAt(sample.meta.capturedAt)}</span>
		<span class="sample-meta">
			{stats.strokes} stroke{stats.strokes === 1 ? '' : 's'} · {stats.points} pts
		</span>
		{#if overlayMissing}
			<span class="sample-warning">No reference SVG for “{sample.label.signId}”</span>
		{/if}
	</div>
	<div class="sample-verdict">
		{#if review}
			<button type="button" class="verdict-btn" disabled={busy} onclick={() => onverdict(null)}>
				Undo
			</button>
		{:else}
			<button
				type="button"
				class="verdict-btn approve"
				disabled={busy}
				onclick={() => onverdict('approved')}
			>
				✓ Approve
			</button>
			<button
				type="button"
				class="verdict-btn reject"
				disabled={busy}
				onclick={() => onverdict('rejected')}
			>
				✗ Reject
			</button>
		{/if}
	</div>
</article>

<style>
	.sample-card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
		padding: 10px;
		border: 1px solid rgba(36, 27, 22, 0.16);
		border-radius: 8px;
		background: rgba(255, 251, 233, 0.85);
	}

	.sample-card.approved {
		border-color: rgba(47, 138, 100, 0.55);
	}

	.sample-card.rejected {
		border-color: rgba(184, 69, 49, 0.5);
	}

	.sample-card.rejected .sample-thumb {
		opacity: 0.62;
	}

	.sample-thumb {
		display: block;
		width: 100%;
		aspect-ratio: 1 / 1;
		min-height: 0;
		padding: 0;
		overflow: hidden;
		border: 1px solid rgba(36, 27, 22, 0.12);
		border-radius: 6px;
		/* Visible behind letterboxing when the capture canvas was not square. */
		background: #efe6cf;
		box-shadow: none;
		cursor: zoom-in;
	}

	.sample-thumb:hover,
	.sample-thumb:focus-visible {
		border-color: rgba(31, 111, 115, 0.55);
		background: #efe6cf;
	}

	.sample-caption {
		display: grid;
		gap: 2px;
	}

	.sample-name {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		font-size: 14px;
		font-weight: 600;
	}

	.sample-badge {
		font-size: 11px;
		font-weight: 400;
		text-transform: uppercase;
		letter-spacing: 0.4px;
	}

	.sample-badge.approved {
		color: #2f8a64;
	}

	.sample-badge.rejected {
		color: var(--ember);
	}

	.sample-meta {
		color: var(--muted-ink);
		font-size: 12px;
	}

	.sample-warning {
		color: var(--ember);
		font-size: 12px;
	}

	.sample-verdict {
		display: flex;
		gap: 6px;
		margin-top: auto;
	}

	.verdict-btn {
		flex: 1 1 0;
		min-height: 30px;
		padding: 0 8px;
		font-size: 13px;
	}

	.verdict-btn.approve:not(:disabled):hover {
		border-color: rgba(47, 138, 100, 0.6);
		background: rgba(47, 138, 100, 0.16);
	}

	.verdict-btn.reject:not(:disabled):hover {
		border-color: rgba(184, 69, 49, 0.55);
		background: rgba(184, 69, 49, 0.14);
	}
</style>
