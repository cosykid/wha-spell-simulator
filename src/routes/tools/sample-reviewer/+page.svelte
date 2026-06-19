<!--
@component
The Sample Reviewer page: a thin shell around the shared {@link ReviewerSession}. It binds the
filter toolbar and the infinite-scroll grid (with its sentinel + "loading more" animation) to
the session, and mounts the detail dialog. All fetching, pagination, and verdict logic live in
the session.
-->
<script lang="ts">
	import SampleCard from './SampleCard.svelte';
	import SampleDetailDialog from './SampleDetailDialog.svelte';
	import {
		ReviewerSession,
		setReviewerSession,
		STATUS_CHOICES
	} from './reviewer-session.svelte.js';

	const session = setReviewerSession(new ReviewerSession());

	let sentinel = $state<HTMLElement>();

	// Reload from the top whenever a filter changes. Effects only run in the browser, so this
	// also performs the initial fetch after the prerendered page hydrates.
	$effect(() => {
		void session.loadFirstPage(session.signFilter, session.statusFilter, session.appliedUsername);
	});

	// Pull the next page as the sentinel nears the viewport. rootMargin prefetches before it's
	// visible; the viewport root also clips the inner scroller, so both layouts work.
	$effect(() => {
		const el = sentinel;
		if (!el) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) void session.loadMore();
			},
			{ rootMargin: '400px' }
		);
		observer.observe(el);
		return () => observer.disconnect();
	});

	// Animate the "Loading more" dots while another page is still on its way. The timer only
	// runs while the sentinel is shown (more pages remain) and stops at the bottom.
	$effect(() => {
		if (!session.hasMore || session.loadMoreError) {
			session.loadingDots = 0;
			return;
		}
		const timer = setInterval(() => {
			session.loadingDots = (session.loadingDots + 1) % 4;
		}, 350);
		return () => clearInterval(timer);
	});
</script>

<svelte:window onkeydown={session.onWindowKeydown} />

<svelte:head>
	<title>Sample Reviewer</title>
</svelte:head>

<main class="reviewer-workspace">
	<section class="reviewer-panel">
		<div class="toolbar reviewer-toolbar">
			<label class="reviewer-filter">
				<span class="label">Sign</span>
				<select class="select-control" bind:value={session.signFilter}>
					<option value="all">All signs</option>
					{#each session.signOptions as id (id)}
						<option value={id}>{session.displayName(id)}</option>
					{/each}
				</select>
			</label>
			<label class="reviewer-filter">
				<span class="label">Status</span>
				<select class="select-control" bind:value={session.statusFilter}>
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
					bind:value={session.usernameQuery}
					oninput={session.onUsernameInput}
					placeholder="Search Discord username"
					autocomplete="off"
					autocapitalize="off"
					spellcheck="false"
				/>
			</label>
			<label class="toggle">
				<span>Overlay</span>
				<input type="checkbox" bind:checked={session.showOverlay} />
			</label>
			<button type="button" onclick={session.refresh} disabled={session.loading}>Refresh</button>
			<span class="reviewer-status">
				{#if session.actionError}
					<span class="reviewer-error">{session.actionError}</span>
				{:else if session.loading}
					Loading samples…
				{:else if session.reviewCounts}
					{session.samples.length} shown · {session.reviewCounts.pending} pending · {session
						.reviewCounts.approved} approved · {session.reviewCounts.rejected} rejected
				{/if}
			</span>
		</div>

		<div class="reviewer-scroll">
			{#if session.error}
				<p class="reviewer-note">Could not load samples: {session.error}</p>
			{:else if !session.loading && session.samples.length === 0}
				{#if session.statusFilter === 'pending' && session.signFilter === 'all' && session.reviewCounts && session.reviewCounts.pending === 0}
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
					{#each session.samples as sample, index (sample.id)}
						<li>
							<SampleCard
								{sample}
								displayName={session.displayName(sample.label.signId)}
								showOverlay={session.showOverlay}
								busy={session.savingIds.includes(sample.id)}
								onopen={() => session.openDetail(index)}
								onverdict={(status) => session.applyVerdict(sample, status)}
							/>
						</li>
					{/each}
				</ul>
				{#if session.hasMore}
					<div class="reviewer-sentinel" bind:this={sentinel}>
						{#if session.loadMoreError}
							<span class="reviewer-error">{session.loadMoreError}</span>
							<button type="button" onclick={() => void session.loadMore()}>Load more</button>
						{:else}
							<span class="reviewer-note"
								>Loading more<span class="loading-dots" aria-hidden="true"
									>{'.'.repeat(session.loadingDots)}</span
								></span
							>
						{/if}
					</div>
				{/if}
			{/if}
		</div>
	</section>
</main>

<SampleDetailDialog />

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

	@media (max-width: 1050px) {
		.reviewer-panel {
			overflow: visible;
		}

		.reviewer-scroll {
			overflow: visible;
		}
	}
</style>
