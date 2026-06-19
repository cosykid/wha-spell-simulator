<!--
@component
The Leaderboard page: a thin shell around the shared {@link LeaderboardSession}. It renders the
intro/role card and the tab switcher, then defers each board's toolbar, totals, and table to the
shared {@link LeaderboardTotals} and {@link BoardTable} components. All fetch state and ranking
live in the session.
-->
<script lang="ts">
	import BoardTable from './components/BoardTable.svelte';
	import LeaderboardTotals from './components/LeaderboardTotals.svelte';
	import { TITLES, UNKNOWN_CONTRIBUTOR, titleClass } from './leaderboard.js';
	import {
		LeaderboardSession,
		RANK_CHOICES,
		setLeaderboardSession
	} from './leaderboard-state.svelte.js';

	const session = setLeaderboardSession(new LeaderboardSession());

	// Effects only run in the browser, so these also perform the initial fetch after the
	// prerendered page hydrates. Each board loads only while its tab is active, so switching
	// tabs fetches lazily.
	$effect(() => {
		if (session.view === 'contributors') void session.loadContributors(session.signFilter);
	});
	$effect(() => {
		if (session.view === 'signs') void session.loadSigns(session.signAppliedUser);
	});
</script>

<svelte:head>
	<title>Leaderboard</title>
</svelte:head>

<main class="leaderboard">
	<div class="leaderboard-inner">
		<details class="panel intro-card">
			<summary class="intro-summary">How the leaderboard works &amp; Discord roles</summary>
			<p class="leaderboard-intro">
				Drawing contributions ranked by Discord handle, tallied from every submitted sample. Samples
				sent without a handle are pooled under <strong>{UNKNOWN_CONTRIBUTOR}</strong>. Earn Discord
				roles by total drawings:
				{#each TITLES.slice().reverse() as t, i (t.name)}<!--
				-->{i > 0 ? ', ' : ' '}<span
						class={titleClass(t.name)}>{t.name}</span
					>
					({t.minDrawings}+){/each}.
			</p>
		</details>

		<section class="panel dashboard-card">
			<div class="leaderboard-tabs" role="tablist">
				<button
					type="button"
					role="tab"
					class="tab"
					class:active={session.view === 'contributors'}
					aria-selected={session.view === 'contributors'}
					onclick={() => (session.view = 'contributors')}>Contributors</button
				>
				<button
					type="button"
					role="tab"
					class="tab"
					class:active={session.view === 'signs'}
					aria-selected={session.view === 'signs'}
					onclick={() => (session.view = 'signs')}>Signs</button
				>
			</div>

			{#if session.view === 'contributors'}
				<div class="toolbar leaderboard-toolbar">
					<label class="leaderboard-filter">
						<span class="label">Rank by</span>
						<select class="select-control" bind:value={session.rankBy}>
							{#each RANK_CHOICES as choice (choice.value)}
								<option value={choice.value}>{choice.label}</option>
							{/each}
						</select>
					</label>
					<label class="leaderboard-filter">
						<span class="label">Sign</span>
						<select class="select-control" bind:value={session.signFilter}>
							<option value="all">All signs</option>
							{#each session.signOptions as id (id)}
								<option value={id}>{session.displayName(id)}</option>
							{/each}
						</select>
					</label>
					<label class="leaderboard-filter">
						<span class="label">Username</span>
						<input
							class="select-control username-search"
							type="search"
							bind:value={session.usernameQuery}
							placeholder="Search Discord username"
							autocomplete="off"
							autocapitalize="off"
							spellcheck="false"
						/>
					</label>
					<div class="toolbar-actions">
						<button type="button" onclick={session.refreshContributors} disabled={session.loading}
							>Refresh</button
						>
						<span class="leaderboard-summary">
							{#if session.loading}
								Tallying contributions…
							{:else if !session.error}
								{#if session.signFilter !== 'all'}{session.displayName(session.signFilter)} ·{/if}
								{session.visibleCount}{session.usernameQuery.trim()
									? ` / ${session.entries.length}`
									: ''} contributor{session.entries.length === 1 ? '' : 's'}
							{/if}
						</span>
					</div>
				</div>

				{#if !session.error && !session.loading && session.visibleCount > 0}
					<LeaderboardTotals
						drawings={session.shownDrawings}
						approved={session.shownApproved}
						rejected={session.shownRejected}
					/>
				{/if}

				{#if session.error}
					<p class="leaderboard-note leaderboard-error">
						Could not load the leaderboard: {session.error}
					</p>
				{:else if !session.loading && session.entries.length === 0}
					<p class="leaderboard-note">
						No samples on record yet — submissions from the Sample Maker appear here.
					</p>
				{:else if !session.loading && session.visibleCount === 0}
					<p class="leaderboard-note">No contributor matches “{session.usernameQuery.trim()}”.</p>
				{:else if session.entries.length > 0}
					<BoardTable
						rows={session.contributorRows}
						rankBy={session.rankBy}
						nameHeader="Discord"
						showTitle
					/>
				{/if}
			{:else}
				<div class="toolbar leaderboard-toolbar">
					<label class="leaderboard-filter">
						<span class="label">Rank by</span>
						<select class="select-control" bind:value={session.signRankBy}>
							{#each RANK_CHOICES as choice (choice.value)}
								<option value={choice.value}>{choice.label}</option>
							{/each}
						</select>
					</label>
					<label class="leaderboard-filter">
						<span class="label">Username</span>
						<input
							class="select-control username-search"
							type="search"
							bind:value={session.signUser}
							oninput={session.onSignUserInput}
							placeholder="A contributor's per-sign counts"
							autocomplete="off"
							autocapitalize="off"
							spellcheck="false"
						/>
					</label>
					<div class="toolbar-actions">
						<button type="button" onclick={session.refreshSigns} disabled={session.signLoading}
							>Refresh</button
						>
						<span class="leaderboard-summary">
							{#if session.signLoading}
								Tallying signs…
							{:else if !session.signError}
								{#if session.signAppliedUser}{session.signAppliedUser} ·{/if}
								{session.signs.length} sign{session.signs.length === 1 ? '' : 's'}
							{/if}
						</span>
					</div>
				</div>

				{#if !session.signError && !session.signLoading && session.signs.length > 0}
					<LeaderboardTotals
						drawings={session.signsDrawings}
						approved={session.signsApproved}
						rejected={session.signsRejected}
					/>
				{/if}

				{#if session.signError}
					<p class="leaderboard-note leaderboard-error">
						Could not load the signs: {session.signError}
					</p>
				{:else if !session.signLoading && session.signs.length === 0}
					<p class="leaderboard-note">
						{session.signAppliedUser
							? `No drawings found for “${session.signAppliedUser}”.`
							: 'No samples on record yet — submissions from the Sample Maker appear here.'}
					</p>
				{:else if session.signs.length > 0}
					<BoardTable rows={session.signRows} rankBy={session.signRankBy} nameHeader="Sign" />
				{/if}
			{/if}
		</section>
	</div>
</main>

<style>
	.leaderboard {
		/* Fill the remaining height under the fixed app shell. The scroll lives inside the
		   dashboard card (see .table-scroll) so its scrollbar sits in the card, not at the
		   page edge; this stays auto as a fallback for very short viewports. The bottom
		   padding leaves breathing room past the last card. */
		flex: 1 1 auto;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		padding: clamp(1rem, 3vw, 2rem) clamp(1rem, 3vw, 2.5rem) clamp(1.5rem, 4vw, 2.5rem);
	}

	.leaderboard-inner {
		width: min(820px, 100%);
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		/* Fill the scroll area so the dashboard card can bound its inner table scroll. */
		flex: 1 1 auto;
		min-height: 0;
	}

	/* Parchment card surface, kept readable over the background artwork. */
	.panel {
		padding: clamp(1.25rem, 2.5vw, 1.75rem);
		background: rgba(242, 236, 214, 0.95);
		border: 1px solid var(--panel-line);
		border-radius: 16px;
		box-shadow: 0 18px 45px var(--shadow);
	}

	/* The description is supporting context, not the main event. It collapses by default
	   so the table below gets the vertical room; open it for the role thresholds. */
	.intro-card {
		padding: clamp(0.7rem, 1.8vw, 1rem) clamp(1.25rem, 3vw, 1.75rem);
		flex-shrink: 0;
	}

	.intro-summary {
		font-family: 'Cinzel', serif;
		font-size: 0.95rem;
		color: var(--ink);
		cursor: pointer;
		list-style: none;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.intro-summary::-webkit-details-marker {
		display: none;
	}

	/* Custom disclosure triangle that rotates when the panel opens. */
	.intro-summary::before {
		content: '';
		width: 0;
		height: 0;
		border-left: 5px solid currentColor;
		border-top: 4px solid transparent;
		border-bottom: 4px solid transparent;
		transition: transform 0.15s ease;
	}

	.intro-card[open] .intro-summary::before {
		transform: rotate(90deg);
	}

	.intro-card[open] .intro-summary {
		margin-bottom: 0.6rem;
	}

	.dashboard-card {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		/* Fill remaining height and clip, so the inner table owns the scroll and the
		   scrollbar stays inside this card's rounded border. */
		flex: 1 1 auto;
		min-height: 0;
		overflow: hidden;
	}

	/* Tab switcher between the Contributors and Signs leaderboards. */
	.leaderboard-tabs {
		display: flex;
		gap: 6px;
		flex-shrink: 0;
		border-bottom: 1px solid rgba(36, 27, 22, 0.16);
		padding-bottom: 8px;
	}

	.tab {
		flex: 1 1 auto;
		font-family: 'Cinzel', serif;
		font-size: 0.95rem;
		padding: 6px 14px;
		border: 1px solid var(--panel-line);
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.28);
		color: var(--ink);
		cursor: pointer;
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}

	.tab:hover:not(.active) {
		background: rgba(255, 255, 255, 0.5);
	}

	.tab.active {
		background: var(--panel-line);
		border-color: var(--panel-line);
		color: #fff7db;
		font-weight: 700;
	}

	.leaderboard-intro {
		max-width: 70ch;
		margin: 0;
		color: var(--ink);
		font-size: 0.9rem;
		line-height: 1.5;
	}

	.leaderboard-toolbar {
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 14px;
		/* Slim band that blends into the card — the heavy panel background/min-height the
		   shared .toolbar adds would waste vertical room above the table. */
		min-height: 0;
		padding: 0 0 10px;
		background: none;
		flex-shrink: 0;
	}

	.leaderboard-filter {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}

	.username-search {
		min-width: 160px;
		flex: 1 1 160px;
	}

	/* Refresh + contributor count sit at the end of the filter row, wrapping below only
	   when the row runs out of width. */
	.toolbar-actions {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-left: auto;
		flex: 0 1 auto;
	}

	.leaderboard-summary {
		margin-left: auto;
		color: var(--muted-ink, #6c5b4d);
		font-size: 13px;
	}

	.leaderboard-note {
		margin: 0;
		color: var(--muted-ink);
		font-size: 0.9rem;
	}

	.leaderboard-error {
		color: var(--ember, #b84531);
	}

	@media (max-width: 640px) {
		.leaderboard {
			padding: clamp(0.75rem, 3vw, 1.25rem) clamp(0.5rem, 3vw, 1rem) clamp(2rem, 8vw, 3rem);
		}

		.panel {
			padding: 1.1rem;
		}

		/* Stack the filters full-width so the controls are easy to tap. */
		.leaderboard-filter {
			display: flex;
			width: 100%;
		}

		.leaderboard-filter .label {
			min-width: 5.5rem;
		}

		.leaderboard-filter .select-control {
			flex: 1 1 auto;
			min-width: 0;
		}

		/* Keep Refresh at its natural width (the shared toolbar rule stretches buttons),
		   so the contributor count stays aligned to the right of the actions row. */
		.toolbar-actions button {
			flex: 0 0 auto;
		}
	}
</style>
