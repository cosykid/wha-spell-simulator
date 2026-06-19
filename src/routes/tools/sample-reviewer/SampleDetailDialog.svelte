<!--
@component
The full-detail modal for one sample: a large ink/overlay render, its metadata, and the
approve/reject/undo + copy controls. Opening is driven reactively by the session's
`detailIndex`; navigation and verdicts go back through the session.
-->
<script lang="ts">
	import SampleSvg from './SampleSvg.svelte';
	import { formatCapturedAt } from './renderSample.js';
	import { getReviewerSession } from './reviewer-session.svelte.js';

	const session = getReviewerSession();

	let dialog = $state<HTMLDialogElement>();

	// Mirror the session's detail cursor onto the native <dialog>: open the modal when a sample
	// is selected, close it when the cursor clears. Guarded so re-opening (stepping between
	// samples) doesn't call showModal on an already-open dialog.
	$effect(() => {
		const el = dialog;
		if (!el) return;
		if (session.detailIndex !== null) {
			if (!el.open) el.showModal();
		} else if (el.open) {
			el.close();
		}
	});

	const degrees = (radians: number): string => `${((radians * 180) / Math.PI).toFixed(1)}°`;
</script>

<dialog bind:this={dialog} class="detail-dialog" onclose={() => (session.detailIndex = null)}>
	{#if session.detail && session.detailStats}
		{@const detail = session.detail}
		{@const detailStats = session.detailStats}
		<header class="detail-header">
			<h2>
				{session.displayName(detail.label.signId)}
				{#if detail.review}
					<span class="detail-badge {detail.review.status}">{detail.review.status}</span>
				{/if}
			</h2>
			<div class="detail-nav">
				<button type="button" onclick={() => session.step(-1)} aria-label="Previous sample"
					>‹</button
				>
				<span>{(session.detailIndex ?? 0) + 1} / {session.samples.length}</span>
				<button type="button" onclick={() => session.step(1)} aria-label="Next sample">›</button>
				<button type="button" onclick={() => dialog?.close()}>Close</button>
			</div>
		</header>

		<div class="detail-figure">
			<SampleSvg
				sample={detail}
				showOverlay={session.showOverlay}
				inkWidth={2.5}
				overlayWidth={2}
			/>
		</div>

		<dl class="detail-meta">
			<div class="detail-meta-wide">
				<dt>Sample ID</dt>
				<dd class="mono">{detail.id}</dd>
			</div>
			{#if detail.meta.discordUsername}
				<div class="detail-meta-wide">
					<dt>Drawn by</dt>
					<dd>{detail.meta.discordUsername}</dd>
				</div>
			{/if}
			<div>
				<dt>Captured</dt>
				<dd>{formatCapturedAt(detail.meta.capturedAt)}</dd>
			</div>
			<div>
				<dt>Angle</dt>
				<dd>{degrees(detail.label.angle)}</dd>
			</div>
			<div>
				<dt>Scale (x × y)</dt>
				<dd>{detail.label.scale_x.toFixed(3)} × {detail.label.scale_y.toFixed(3)}</dd>
			</div>
			<div>
				<dt>Center</dt>
				<dd>({Math.round(detail.label.translate_x)}, {Math.round(detail.label.translate_y)})</dd>
			</div>
			<div>
				<dt>Ink</dt>
				<dd>
					{detailStats.strokes} strokes · {detailStats.points} pts · {(
						detailStats.durationMs / 1000
					).toFixed(1)}s
				</dd>
			</div>
			<div>
				<dt>Canvas</dt>
				<dd>
					{detail.meta.canvasWidth} × {detail.meta.canvasHeight} @ {detail.meta.devicePixelRatio}×
				</dd>
			</div>
			<div>
				<dt>Review</dt>
				<dd>
					{detail.review
						? `${detail.review.status} · ${formatCapturedAt(detail.review.reviewedAt)}`
						: 'pending'}
				</dd>
			</div>
		</dl>

		<footer class="detail-actions">
			<div class="detail-verdict">
				{#if detail.review}
					<button
						type="button"
						disabled={session.detailBusy}
						onclick={() => session.applyVerdict(detail, null)}
					>
						Undo {detail.review.status} (U)
					</button>
				{:else}
					<button
						type="button"
						class="verdict-approve"
						disabled={session.detailBusy}
						onclick={() => session.verdictFromDialog('approved')}
					>
						✓ Approve (A)
					</button>
					<button
						type="button"
						class="verdict-reject"
						disabled={session.detailBusy}
						onclick={() => session.verdictFromDialog('rejected')}
					>
						✗ Reject (R)
					</button>
				{/if}
			</div>
			<button type="button" onclick={() => session.copy('id')}>
				{session.copied === 'id' ? 'Copied!' : 'Copy ID'}
			</button>
			<button type="button" onclick={() => session.copy('json')}>
				{session.copied === 'json' ? 'Copied!' : 'Copy JSON'}
			</button>
		</footer>
	{/if}
</dialog>

<style>
	.detail-dialog {
		width: min(720px, 94vw);
		border: 1px solid var(--panel-line);
		border-radius: 10px;
		padding: 16px;
		color: var(--ink);
		background: var(--panel);
		box-shadow: 0 24px 60px rgba(36, 27, 22, 0.45);
	}

	.detail-dialog::backdrop {
		background: rgba(36, 27, 22, 0.5);
	}

	.detail-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-bottom: 10px;
	}

	.detail-header h2 {
		display: flex;
		align-items: baseline;
		gap: 10px;
		margin: 0;
		font-family: 'Cinzel', serif;
		font-size: 18px;
	}

	.detail-badge {
		font-family: 'IM Fell English', Georgia, serif;
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.detail-badge.approved {
		color: #2f8a64;
	}

	.detail-badge.rejected {
		color: var(--ember);
	}

	.detail-nav {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--muted-ink);
		font-size: 13px;
		font-variant-numeric: tabular-nums;
	}

	.detail-nav button {
		min-height: 32px;
		padding: 0 10px;
	}

	.detail-figure {
		height: min(54vh, 560px);
		overflow: hidden;
		border: 1px solid rgba(36, 27, 22, 0.14);
		border-radius: 6px;
		background: #efe6cf;
	}

	.detail-meta {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 6px 18px;
		margin: 12px 0 0;
	}

	.detail-meta div {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		border-bottom: 1px dashed rgba(36, 27, 22, 0.14);
		padding-bottom: 4px;
	}

	.detail-meta-wide {
		grid-column: 1 / -1;
	}

	.detail-meta dt {
		color: var(--muted-ink);
		font-size: 12px;
		white-space: nowrap;
	}

	.detail-meta dd {
		margin: 0;
		font-size: 12px;
		text-align: right;
		overflow-wrap: anywhere;
	}

	.mono {
		font-family: 'JetBrains Mono', Consolas, 'Courier New', monospace;
	}

	.detail-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 12px;
	}

	.detail-verdict {
		display: flex;
		flex: 1 1 auto;
		gap: 8px;
	}

	.detail-verdict button {
		font-weight: 600;
	}

	.verdict-approve:not(:disabled) {
		border-color: rgba(47, 138, 100, 0.6);
		background: rgba(47, 138, 100, 0.16);
	}

	.verdict-approve:not(:disabled):hover {
		background: rgba(47, 138, 100, 0.28);
	}

	.verdict-reject:not(:disabled) {
		border-color: rgba(184, 69, 49, 0.55);
		background: rgba(184, 69, 49, 0.14);
	}

	.verdict-reject:not(:disabled):hover {
		background: rgba(184, 69, 49, 0.26);
	}
</style>
