<script lang="ts">
	import { resolve } from '$app/paths';
	import type {
		LabelledSample,
		ReviewStatus,
		SampleReview
	} from '$lib/structures/labelledSample.js';
	import { SAMPLE_SYMBOLS } from '../sample-maker/symbols.js';
	import SampleCard from './SampleCard.svelte';
	import SampleSvg from './SampleSvg.svelte';
	import { formatCapturedAt, sampleStats } from './renderSample.js';
	import { setReviewStatus } from './review.remote.js';

	/** Rows fetched per page as the reviewer scrolls; the API caps a listing at 200. */
	const PAGE_SIZE = 60;

	/** Sample tallies per review state, mirrored from the API response. */
	type ReviewCounts = Record<'pending' | 'approved' | 'rejected', number>;

	type StatusFilter = ReviewStatus | 'pending' | 'all';
	const STATUS_CHOICES: { value: StatusFilter; label: string }[] = [
		{ value: 'pending', label: 'Pending' },
		{ value: 'approved', label: 'Approved' },
		{ value: 'rejected', label: 'Rejected' },
		{ value: 'all', label: 'All' }
	];

	const NAME_BY_ID = new Map(SAMPLE_SYMBOLS.map((s) => [s.id, s.displayName]));
	const displayName = (signId: string): string => NAME_BY_ID.get(signId) ?? signId;

	// Sign ids offered by the filter: the Sample Maker's roster plus anything seen in
	// stored samples (older submissions carry signs the maker no longer offers).
	let knownSignIds = $state<string[]>(SAMPLE_SYMBOLS.map((s) => s.id));
	const signOptions = $derived(
		[...knownSignIds].sort((a, b) => displayName(a).localeCompare(displayName(b)))
	);

	// Filters. Status defaults to 'pending' so the page opens on the unreviewed queue.
	let signFilter = $state<string>('all');
	let statusFilter = $state<StatusFilter>('pending');
	let showOverlay = $state(true);

	// Username search. `usernameQuery` tracks the input; `appliedUsername` is the
	// debounced value that actually drives the fetch, so typing doesn't hammer the API.
	let usernameQuery = $state('');
	let appliedUsername = $state('');
	let usernameTimer: ReturnType<typeof setTimeout> | undefined;
	function onUsernameInput(): void {
		clearTimeout(usernameTimer);
		usernameTimer = setTimeout(() => (appliedUsername = usernameQuery.trim()), 300);
	}

	// Query state. `loading` covers the first page; `loadingMore` covers appended pages.
	let samples = $state<LabelledSample[]>([]);
	let reviewCounts = $state<ReviewCounts | null>(null);
	let loading = $state(true);
	let loadingMore = $state(false);
	let hasMore = $state(false);
	let error = $state<string | null>(null);
	let loadMoreError = $state<string | null>(null);
	let requestSeq = 0;
	let sentinel = $state<HTMLElement>();
	// Count of dots shown after "Loading more"; cycles 0 → 3 while more pages remain.
	let loadingDots = $state(0);

	// Verdict state: ids with an in-flight save, plus the latest failure (if any).
	let savingIds = $state<string[]>([]);
	let actionError = $state<string | null>(null);

	// Detail dialog
	let dialog = $state<HTMLDialogElement>();
	let detailIndex = $state<number | null>(null);
	let copied = $state<'id' | 'json' | null>(null);
	const detail = $derived(detailIndex === null ? null : (samples[detailIndex] ?? null));
	const detailStats = $derived(detail ? sampleStats(detail) : null);
	const detailBusy = $derived(detail !== null && savingIds.includes(detail.id));

	/** Keyset cursor pointing at the last row already loaded. */
	type Cursor = { capturedAt: string; id: string };

	type SamplesResponse = {
		count: number | null;
		reviewCounts: ReviewCounts | null;
		samples: LabelledSample[];
	};

	/** Fetches one page of samples for the current filters; throws on a bad response. */
	async function fetchSamples(
		signId: string,
		status: StatusFilter,
		username: string,
		cursor: Cursor | null
	): Promise<SamplesResponse> {
		const sign = signId === 'all' ? '' : `&signId=${encodeURIComponent(signId)}`;
		const review = status === 'all' ? '' : `&reviewStatus=${status}`;
		const user = username ? `&username=${encodeURIComponent(username)}` : '';
		const seek = cursor
			? `&cursorCapturedAt=${encodeURIComponent(cursor.capturedAt)}&cursorId=${encodeURIComponent(cursor.id)}`
			: '';
		const response = await fetch(
			`${resolve('/api/samples')}?limit=${PAGE_SIZE}${sign}${review}${user}${seek}`
		);
		const body = (await response.json()) as
			| ({ ok: true } & SamplesResponse)
			| { ok: false; error?: string };
		if (!response.ok || !body.ok) {
			throw new Error(
				(!body.ok && body.error) || `The samples endpoint replied ${response.status}.`
			);
		}
		return body;
	}

	/** Note any sign ids the filter doesn't yet offer (older submissions carry them). */
	function registerSignIds(list: LabelledSample[]): void {
		for (const { label } of list) {
			if (!knownSignIds.includes(label.signId)) {
				knownSignIds = [...knownSignIds, label.signId];
			}
		}
	}

	/** Loads the first page for a filter set, replacing whatever is on screen. */
	async function loadFirstPage(
		signId: string,
		status: StatusFilter,
		username: string
	): Promise<void> {
		const seq = ++requestSeq;
		loading = true;
		error = null;
		loadMoreError = null;
		try {
			const body = await fetchSamples(signId, status, username, null);
			if (seq !== requestSeq) return; // superseded by a newer request
			samples = body.samples;
			reviewCounts = body.reviewCounts;
			hasMore = body.samples.length === PAGE_SIZE;
			registerSignIds(body.samples);
		} catch (caught) {
			if (seq !== requestSeq) return;
			error = caught instanceof Error ? caught.message : 'Failed to load samples.';
			samples = [];
			reviewCounts = null;
			hasMore = false;
		} finally {
			if (seq === requestSeq) loading = false;
		}
	}

	/** Appends the next page; fired by the scroll sentinel or the retry button. */
	async function loadMore(): Promise<void> {
		if (loading || loadingMore || !hasMore) return;
		const last = samples[samples.length - 1];
		if (!last) return;
		const seq = requestSeq; // tie to the current filter set, don't supersede it
		loadingMore = true;
		loadMoreError = null;
		try {
			const cursor: Cursor = { capturedAt: last.meta.capturedAt, id: last.id };
			const body = await fetchSamples(signFilter, statusFilter, appliedUsername, cursor);
			if (seq !== requestSeq) return; // filters changed mid-flight; drop this page
			samples = [...samples, ...body.samples];
			hasMore = body.samples.length === PAGE_SIZE;
			registerSignIds(body.samples);
		} catch (caught) {
			if (seq !== requestSeq) return;
			loadMoreError = caught instanceof Error ? caught.message : 'Failed to load more samples.';
		} finally {
			loadingMore = false;
		}
	}

	// Reload from the top whenever a filter changes. Effects only run in the browser, so
	// this also performs the initial fetch after the prerendered page hydrates.
	$effect(() => {
		void loadFirstPage(signFilter, statusFilter, appliedUsername);
	});

	// Pull the next page as the sentinel nears the viewport. rootMargin prefetches before
	// it's visible; the viewport root also clips the inner scroller, so both layouts work.
	$effect(() => {
		const el = sentinel;
		if (!el) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) void loadMore();
			},
			{ rootMargin: '400px' }
		);
		observer.observe(el);
		return () => observer.disconnect();
	});

	// Animate the "Loading more" dots while another page is still on its way. The timer
	// only runs while the sentinel is shown (more pages remain) and stops at the bottom.
	$effect(() => {
		if (!hasMore || loadMoreError) {
			loadingDots = 0;
			return;
		}
		const timer = setInterval(() => {
			loadingDots = (loadingDots + 1) % 4;
		}, 350);
		return () => clearInterval(timer);
	});

	const refresh = (): void => void loadFirstPage(signFilter, statusFilter, appliedUsername);

	/**
	 * Saves a verdict (or clears it with `null`) and patches the local list in place.
	 * Verdict-ed cards stay visible until the next refetch so a misclick is undoable.
	 */
	async function applyVerdict(sample: LabelledSample, status: ReviewStatus | null): Promise<void> {
		if (savingIds.includes(sample.id)) return;
		savingIds = [...savingIds, sample.id];
		actionError = null;
		try {
			const result = await setReviewStatus({ id: sample.id, status });
			if (!result.ok) {
				actionError =
					result.reason === 'not-found'
						? 'That sample no longer exists in the database.'
						: 'Saving the verdict failed — try again.';
				return;
			}
			patchSample(sample.id, result.review);
		} catch {
			actionError = 'Saving the verdict failed — try again.';
		} finally {
			savingIds = savingIds.filter((id) => id !== sample.id);
		}
	}

	/** Applies a saved verdict to the local list and the per-status tallies. */
	function patchSample(id: string, review: SampleReview | null): void {
		const previous = samples.find((s) => s.id === id);
		if (!previous) return;
		const from = previous.review?.status ?? 'pending';
		const to = review?.status ?? 'pending';
		if (reviewCounts && from !== to) {
			reviewCounts[from] -= 1;
			reviewCounts[to] += 1;
		}
		samples = samples.map((s) => (s.id === id ? { ...s, review } : s));
	}

	/** Records a verdict from the dialog, then advances to keep the review flowing. */
	async function verdictFromDialog(status: ReviewStatus): Promise<void> {
		if (!detail) return;
		await applyVerdict(detail, status);
		if (!actionError && samples.length > 1) step(1);
	}

	function openDetail(index: number): void {
		detailIndex = index;
		copied = null;
		dialog?.showModal();
	}

	/** Step through samples inside the dialog, wrapping at both ends. */
	function step(delta: number): void {
		if (detailIndex === null || samples.length === 0) return;
		detailIndex = (detailIndex + delta + samples.length) % samples.length;
		copied = null;
	}

	function onWindowKeydown(event: KeyboardEvent): void {
		if (detailIndex === null) return;
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		switch (event.key) {
			case 'ArrowRight':
				event.preventDefault();
				step(1);
				break;
			case 'ArrowLeft':
				event.preventDefault();
				step(-1);
				break;
			case 'a':
			case 'A':
				void verdictFromDialog('approved');
				break;
			case 'r':
			case 'R':
				void verdictFromDialog('rejected');
				break;
			case 'u':
			case 'U':
				if (detail?.review) void applyVerdict(detail, null);
				break;
		}
	}

	/** Copy the sample's id (for DB lookups) or full JSON (feeds `npm run sample:svg`). */
	async function copy(kind: 'id' | 'json'): Promise<void> {
		if (!detail) return;
		await navigator.clipboard.writeText(
			kind === 'id' ? detail.id : JSON.stringify(detail, null, '\t')
		);
		copied = kind;
	}

	const degrees = (radians: number): string => `${((radians * 180) / Math.PI).toFixed(1)}°`;
</script>

<svelte:window onkeydown={onWindowKeydown} />

<svelte:head>
	<title>Sample Reviewer</title>
</svelte:head>

<main class="reviewer-workspace">
	<section class="reviewer-panel">
		<div class="toolbar reviewer-toolbar">
			<label class="reviewer-filter">
				<span class="label">Sign</span>
				<select class="select-control" bind:value={signFilter}>
					<option value="all">All signs</option>
					{#each signOptions as id (id)}
						<option value={id}>{displayName(id)}</option>
					{/each}
				</select>
			</label>
			<label class="reviewer-filter">
				<span class="label">Status</span>
				<select class="select-control" bind:value={statusFilter}>
					{#each STATUS_CHOICES as choice (choice.value)}
						<option value={choice.value}>{choice.label}</option>
					{/each}
				</select>
			</label>
			<label class="reviewer-filter">
				<span class="label">Username</span>
				<input
					class="select-control username-search"
					type="search"
					bind:value={usernameQuery}
					oninput={onUsernameInput}
					placeholder="Search Discord username"
					autocomplete="off"
					autocapitalize="off"
					spellcheck="false"
				/>
			</label>
			<label class="toggle">
				<span>Overlay</span>
				<input type="checkbox" bind:checked={showOverlay} />
			</label>
			<button type="button" onclick={refresh} disabled={loading}>Refresh</button>
			<span class="reviewer-status">
				{#if actionError}
					<span class="reviewer-error">{actionError}</span>
				{:else if loading}
					Loading samples…
				{:else if reviewCounts}
					{samples.length} shown · {reviewCounts.pending} pending · {reviewCounts.approved}
					approved · {reviewCounts.rejected} rejected
				{/if}
			</span>
		</div>

		<div class="reviewer-scroll">
			{#if error}
				<p class="reviewer-note">Could not load samples: {error}</p>
			{:else if !loading && samples.length === 0}
				{#if statusFilter === 'pending' && signFilter === 'all' && reviewCounts && reviewCounts.pending === 0}
					<p class="reviewer-note">
						Nothing left to review — every stored sample has a verdict. New submissions from the
						Sample Maker will show up here.
					</p>
				{:else}
					<p class="reviewer-note">
						No stored samples match this filter — submissions from the Sample Maker appear here,
						most recent first.
					</p>
				{/if}
			{:else}
				<ul class="reviewer-grid">
					{#each samples as sample, index (sample.id)}
						<li>
							<SampleCard
								{sample}
								displayName={displayName(sample.label.signId)}
								{showOverlay}
								busy={savingIds.includes(sample.id)}
								onopen={() => openDetail(index)}
								onverdict={(status) => applyVerdict(sample, status)}
							/>
						</li>
					{/each}
				</ul>
				{#if hasMore}
					<div class="reviewer-sentinel" bind:this={sentinel}>
						{#if loadMoreError}
							<span class="reviewer-error">{loadMoreError}</span>
							<button type="button" onclick={() => void loadMore()}>Load more</button>
						{:else}
							<span class="reviewer-note"
								>Loading more<span class="loading-dots" aria-hidden="true"
									>{'.'.repeat(loadingDots)}</span
								></span
							>
						{/if}
					</div>
				{/if}
			{/if}
		</div>
	</section>
</main>

<dialog bind:this={dialog} class="detail-dialog" onclose={() => (detailIndex = null)}>
	{#if detail && detailStats}
		<header class="detail-header">
			<h2>
				{displayName(detail.label.signId)}
				{#if detail.review}
					<span class="detail-badge {detail.review.status}">{detail.review.status}</span>
				{/if}
			</h2>
			<div class="detail-nav">
				<button type="button" onclick={() => step(-1)} aria-label="Previous sample">‹</button>
				<span>{(detailIndex ?? 0) + 1} / {samples.length}</span>
				<button type="button" onclick={() => step(1)} aria-label="Next sample">›</button>
				<button type="button" onclick={() => dialog?.close()}>Close</button>
			</div>
		</header>

		<div class="detail-figure">
			<SampleSvg sample={detail} {showOverlay} inkWidth={2.5} overlayWidth={2} />
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
					<button type="button" disabled={detailBusy} onclick={() => applyVerdict(detail!, null)}>
						Undo {detail.review.status} (U)
					</button>
				{:else}
					<button
						type="button"
						class="verdict-approve"
						disabled={detailBusy}
						onclick={() => verdictFromDialog('approved')}
					>
						✓ Approve (A)
					</button>
					<button
						type="button"
						class="verdict-reject"
						disabled={detailBusy}
						onclick={() => verdictFromDialog('rejected')}
					>
						✗ Reject (R)
					</button>
				{/if}
			</div>
			<button type="button" onclick={() => copy('id')}>
				{copied === 'id' ? 'Copied!' : 'Copy ID'}
			</button>
			<button type="button" onclick={() => copy('json')}>
				{copied === 'json' ? 'Copied!' : 'Copy JSON'}
			</button>
		</footer>
	{/if}
</dialog>

<style>
	.reviewer-workspace {
		display: flex;
		flex: 1 1 auto;
		min-height: 0;
	}

	.reviewer-panel {
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
		border: 1px solid rgba(255, 247, 219, 0.28);
		border-radius: var(--radius);
		background: rgba(255, 247, 219, 0.88);
		box-shadow: 0 18px 45px var(--shadow);
	}

	.reviewer-toolbar {
		flex-wrap: wrap;
	}

	.reviewer-filter {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}

	.username-search {
		min-width: 200px;
	}

	.reviewer-status {
		margin-left: auto;
		color: var(--muted-ink);
		font-size: 13px;
	}

	.reviewer-error {
		color: var(--ember);
	}

	.reviewer-scroll {
		flex: 1 1 auto;
		min-height: 0;
		overflow: auto;
		scrollbar-gutter: stable;
		padding: 14px;
	}

	.reviewer-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
		gap: 12px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.reviewer-sentinel {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 18px 2px 6px;
	}

	/* Reserve room for all three dots so the label stays put as they cycle. */
	.loading-dots {
		display: inline-block;
		width: 1.5ch;
		text-align: left;
	}

	.reviewer-note {
		max-width: 52ch;
		margin: 8px 2px;
		color: var(--muted-ink);
		font-size: 14px;
		line-height: 1.5;
	}

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

	@media (max-width: 1050px) {
		.reviewer-panel {
			overflow: visible;
		}

		.reviewer-scroll {
			overflow: visible;
		}
	}
</style>
