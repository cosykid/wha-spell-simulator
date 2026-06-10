<script lang="ts">
	import { resolve } from '$app/paths';
	import { SAMPLE_SYMBOLS } from '../sample-maker/symbols.js';
	import {
		TITLES,
		UNKNOWN_CONTRIBUTOR,
		titleForDrawings,
		type LeaderboardEntry,
		type SignEntry
	} from './leaderboard.js';

	/** The two leaderboards this page switches between. */
	type View = 'contributors' | 'signs';
	let view = $state<View>('contributors');

	/** Which tally drives the ranking. */
	type RankBy = 'total' | 'approved';
	let rankBy = $state<RankBy>('total');

	const RANK_CHOICES: { value: RankBy; label: string }[] = [
		{ value: 'total', label: 'Total drawings' },
		{ value: 'approved', label: 'Approved drawings' }
	];

	const NAME_BY_ID = new Map(SAMPLE_SYMBOLS.map((s) => [s.id, s.displayName]));
	const displayName = (signId: string): string => NAME_BY_ID.get(signId) ?? signId;

	// Sign ids offered by the filter: the Sample Maker roster plus anything else seen
	// in stored samples (older submissions may carry retired signs).
	let knownSignIds = $state<string[]>(SAMPLE_SYMBOLS.map((s) => s.id));
	const signOptions = $derived(
		[...knownSignIds].sort((a, b) => displayName(a).localeCompare(displayName(b)))
	);

	// Filters. `signFilter` re-fetches the DB; `rankBy` and `usernameQuery` are applied
	// client-side over the fetched rows.
	let signFilter = $state<string>('all');
	let usernameQuery = $state('');

	let entries = $state<LeaderboardEntry[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let requestSeq = 0;

	async function loadLeaderboard(sign: string): Promise<void> {
		const seq = ++requestSeq;
		loading = true;
		error = null;
		try {
			const signParam = sign === 'all' ? '' : `?signId=${encodeURIComponent(sign)}`;
			const response = await fetch(`${resolve('/api/leaderboard')}${signParam}`);
			const body = (await response.json()) as
				| { ok: true; entries: LeaderboardEntry[]; signIds: string[] }
				| { ok: false; error?: string };
			if (seq !== requestSeq) return; // superseded by a newer request
			if (!response.ok || !body.ok) {
				throw new Error(
					(!body.ok && body.error) || `The leaderboard endpoint replied ${response.status}.`
				);
			}
			entries = body.entries;
			// Union in any unseen sign ids with a single reassignment (order is irrelevant —
			// `signOptions` sorts by display name).
			const newSignIds = body.signIds.filter((id) => !knownSignIds.includes(id));
			if (newSignIds.length > 0) knownSignIds = [...knownSignIds, ...newSignIds];
		} catch (caught) {
			if (seq !== requestSeq) return;
			error = caught instanceof Error ? caught.message : 'Failed to load the leaderboard.';
			entries = [];
		} finally {
			if (seq === requestSeq) loading = false;
		}
	}

	// Effects only run in the browser, so this also performs the initial fetch after the
	// prerendered page hydrates (mirrors how the Sample Reviewer loads its data). Each view
	// loads only when it's active, so switching tabs fetches lazily.
	$effect(() => {
		if (view === 'contributors') void loadLeaderboard(signFilter);
	});

	const refresh = (): void => void loadLeaderboard(signFilter);

	/** Full board, ranked by the active metric with each row's standing fixed. */
	const ranked = $derived.by(() => {
		const by = rankBy;
		const other: RankBy = by === 'total' ? 'approved' : 'total';
		return [...entries]
			.sort((a, b) => b[by] - a[by] || b[other] - a[other] || a.username.localeCompare(b.username))
			.map((entry, index) => ({ ...entry, rank: index + 1 }));
	});

	// Username search filters the rows shown but keeps each contributor's true standing,
	// so you can look someone up and still see where they place overall.
	const visible = $derived.by(() => {
		const q = usernameQuery.trim().toLowerCase();
		return q ? ranked.filter((row) => row.username.toLowerCase().includes(q)) : ranked;
	});

	// Aggregate counts over the rows currently shown, so they track both the sign
	// filter (re-fetched) and the username search (client-side).
	const shownDrawings = $derived(visible.reduce((sum, e) => sum + e.total, 0));
	const shownApproved = $derived(visible.reduce((sum, e) => sum + e.approved, 0));
	const shownRejected = $derived(visible.reduce((sum, e) => sum + e.rejected, 0));

	// --- Signs leaderboard -------------------------------------------------------------
	let signRankBy = $state<RankBy>('total');
	// Optional contributor scope. `signUser` tracks the input; `signAppliedUser` is the
	// debounced value that drives the fetch (the count is computed server-side per user).
	let signUser = $state('');
	let signAppliedUser = $state('');
	let signUserTimer: ReturnType<typeof setTimeout> | undefined;
	function onSignUserInput(): void {
		clearTimeout(signUserTimer);
		signUserTimer = setTimeout(() => (signAppliedUser = signUser.trim()), 300);
	}

	let signs = $state<SignEntry[]>([]);
	let signLoading = $state(true);
	let signError = $state<string | null>(null);
	let signSeq = 0;

	async function loadSigns(username: string): Promise<void> {
		const seq = ++signSeq;
		signLoading = true;
		signError = null;
		try {
			const userParam = username ? `?username=${encodeURIComponent(username)}` : '';
			const response = await fetch(`${resolve('/api/leaderboard/signs')}${userParam}`);
			const body = (await response.json()) as
				| { ok: true; signs: SignEntry[] }
				| { ok: false; error?: string };
			if (seq !== signSeq) return; // superseded by a newer request
			if (!response.ok || !body.ok) {
				throw new Error(
					(!body.ok && body.error) || `The signs endpoint replied ${response.status}.`
				);
			}
			signs = body.signs;
		} catch (caught) {
			if (seq !== signSeq) return;
			signError = caught instanceof Error ? caught.message : 'Failed to load the sign tallies.';
			signs = [];
		} finally {
			if (seq === signSeq) signLoading = false;
		}
	}

	$effect(() => {
		if (view === 'signs') void loadSigns(signAppliedUser);
	});

	const refreshSigns = (): void => void loadSigns(signAppliedUser);

	/** Signs ranked by the active metric, with the rank fixed per row. */
	const rankedSigns = $derived.by(() => {
		const by = signRankBy;
		const other: RankBy = by === 'total' ? 'approved' : 'total';
		return [...signs]
			.sort(
				(a, b) =>
					b[by] - a[by] ||
					b[other] - a[other] ||
					displayName(a.signId).localeCompare(displayName(b.signId))
			)
			.map((sign, index) => ({ ...sign, rank: index + 1 }));
	});

	const signsDrawings = $derived(signs.reduce((sum, s) => sum + s.total, 0));
	const signsApproved = $derived(signs.reduce((sum, s) => sum + s.approved, 0));
	const signsRejected = $derived(signs.reduce((sum, s) => sum + s.rejected, 0));

	const medal = (place: number): string =>
		place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : '';

	const titleClass = (title: string | null): string =>
		title ? `title title-${title.toLowerCase().replace(/\s+/g, '-')}` : '';
</script>

<svelte:head>
	<title>Leaderboard</title>
</svelte:head>

<main class="leaderboard">
	<div class="leaderboard-inner">
		<section class="panel intro-card">
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
		</section>

		<section class="panel dashboard-card">
			<div class="leaderboard-tabs" role="tablist">
				<button
					type="button"
					role="tab"
					class="tab"
					class:active={view === 'contributors'}
					aria-selected={view === 'contributors'}
					onclick={() => (view = 'contributors')}>Contributors</button
				>
				<button
					type="button"
					role="tab"
					class="tab"
					class:active={view === 'signs'}
					aria-selected={view === 'signs'}
					onclick={() => (view = 'signs')}>Signs</button
				>
			</div>

			{#if view === 'contributors'}
				<div class="toolbar leaderboard-toolbar">
					<label class="leaderboard-filter">
						<span class="label">Rank by</span>
						<select class="select-control" bind:value={rankBy}>
							{#each RANK_CHOICES as choice (choice.value)}
								<option value={choice.value}>{choice.label}</option>
							{/each}
						</select>
					</label>
					<label class="leaderboard-filter">
						<span class="label">Sign</span>
						<select class="select-control" bind:value={signFilter}>
							<option value="all">All signs</option>
							{#each signOptions as id (id)}
								<option value={id}>{displayName(id)}</option>
							{/each}
						</select>
					</label>
					<label class="leaderboard-filter">
						<span class="label">Username</span>
						<input
							class="select-control username-search"
							type="search"
							bind:value={usernameQuery}
							placeholder="Search Discord username"
							autocomplete="off"
							autocapitalize="off"
							spellcheck="false"
						/>
					</label>
					<div class="toolbar-actions">
						<button type="button" onclick={refresh} disabled={loading}>Refresh</button>
						<span class="leaderboard-summary">
							{#if loading}
								Tallying contributions…
							{:else if !error}
								{#if signFilter !== 'all'}{displayName(signFilter)} ·{/if}
								{visible.length}{usernameQuery.trim() ? ` / ${entries.length}` : ''} contributor{entries.length ===
								1
									? ''
									: 's'}
							{/if}
						</span>
					</div>
				</div>

				{#if !error && !loading && visible.length > 0}
					<div class="leaderboard-totals">
						<div class="total-stat">
							<span class="total-value">{shownDrawings}</span>
							<span class="total-label">Drawings</span>
						</div>
						<div class="total-stat approved">
							<span class="total-value">{shownApproved}</span>
							<span class="total-label">Approved</span>
						</div>
						<div class="total-stat rejected">
							<span class="total-value">{shownRejected}</span>
							<span class="total-label">Rejected</span>
						</div>
					</div>
				{/if}

				{#if error}
					<p class="leaderboard-note leaderboard-error">Could not load the leaderboard: {error}</p>
				{:else if !loading && entries.length === 0}
					<p class="leaderboard-note">
						No samples on record yet — submissions from the Sample Maker appear here.
					</p>
				{:else if !loading && visible.length === 0}
					<p class="leaderboard-note">No contributor matches “{usernameQuery.trim()}”.</p>
				{:else if entries.length > 0}
					<div class="table-scroll">
						<table class="leaderboard-table">
							<thead>
								<tr>
									<th class="rank-col">#</th>
									<th>Discord</th>
									<th>Title</th>
									<th class="num-col" aria-sort={rankBy === 'approved' ? 'descending' : 'none'}>
										Approved
									</th>
									<th class="num-col">Rejected</th>
									<th class="num-col" aria-sort={rankBy === 'total' ? 'descending' : 'none'}
										>Total</th
									>
								</tr>
							</thead>
							<tbody>
								{#each visible as row (`${row.anonymous}:${row.username.toLowerCase()}`)}
									{@const title = titleForDrawings(row.overallTotal)}
									<tr class:anonymous={row.anonymous}>
										<td class="rank-col"><span class="rank">{medal(row.rank)} {row.rank}</span></td>
										<td class="name-col">{row.username}</td>
										<td class="title-col">
											{#if title}<span class={titleClass(title)}>{title}</span>{:else}<span
													class="no-title">—</span
												>{/if}
										</td>
										<td class="num-col" class:active={rankBy === 'approved'}>{row.approved}</td>
										<td class="num-col rejected-cell">{row.rejected}</td>
										<td class="num-col" class:active={rankBy === 'total'}>{row.total}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			{:else}
				<div class="toolbar leaderboard-toolbar">
					<label class="leaderboard-filter">
						<span class="label">Rank by</span>
						<select class="select-control" bind:value={signRankBy}>
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
							bind:value={signUser}
							oninput={onSignUserInput}
							placeholder="A contributor's per-sign counts"
							autocomplete="off"
							autocapitalize="off"
							spellcheck="false"
						/>
					</label>
					<div class="toolbar-actions">
						<button type="button" onclick={refreshSigns} disabled={signLoading}>Refresh</button>
						<span class="leaderboard-summary">
							{#if signLoading}
								Tallying signs…
							{:else if !signError}
								{#if signAppliedUser}{signAppliedUser} ·{/if}
								{signs.length} sign{signs.length === 1 ? '' : 's'}
							{/if}
						</span>
					</div>
				</div>

				{#if !signError && !signLoading && signs.length > 0}
					<div class="leaderboard-totals">
						<div class="total-stat">
							<span class="total-value">{signsDrawings}</span>
							<span class="total-label">Drawings</span>
						</div>
						<div class="total-stat approved">
							<span class="total-value">{signsApproved}</span>
							<span class="total-label">Approved</span>
						</div>
						<div class="total-stat rejected">
							<span class="total-value">{signsRejected}</span>
							<span class="total-label">Rejected</span>
						</div>
					</div>
				{/if}

				{#if signError}
					<p class="leaderboard-note leaderboard-error">Could not load the signs: {signError}</p>
				{:else if !signLoading && signs.length === 0}
					<p class="leaderboard-note">
						{signAppliedUser
							? `No drawings found for “${signAppliedUser}”.`
							: 'No samples on record yet — submissions from the Sample Maker appear here.'}
					</p>
				{:else if signs.length > 0}
					<div class="table-scroll">
						<table class="leaderboard-table">
							<thead>
								<tr>
									<th class="rank-col">#</th>
									<th>Sign</th>
									<th class="num-col" aria-sort={signRankBy === 'approved' ? 'descending' : 'none'}>
										Approved
									</th>
									<th class="num-col">Rejected</th>
									<th class="num-col" aria-sort={signRankBy === 'total' ? 'descending' : 'none'}>
										Total
									</th>
								</tr>
							</thead>
							<tbody>
								{#each rankedSigns as sign (sign.signId)}
									<tr>
										<td class="rank-col"
											><span class="rank">{medal(sign.rank)} {sign.rank}</span></td
										>
										<td class="name-col">{displayName(sign.signId)}</td>
										<td class="num-col" class:active={signRankBy === 'approved'}>{sign.approved}</td
										>
										<td class="num-col rejected-cell">{sign.rejected}</td>
										<td class="num-col" class:active={signRankBy === 'total'}>{sign.total}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
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
		gap: 1.25rem;
		/* Fill the scroll area so the dashboard card can bound its inner table scroll. */
		flex: 1 1 auto;
		min-height: 0;
	}

	/* Parchment card surface, kept readable over the background artwork. */
	.panel {
		padding: clamp(1.5rem, 3vw, 2.25rem);
		background: rgba(242, 236, 214, 0.95);
		border: 1px solid var(--panel-line);
		border-radius: 16px;
		box-shadow: 0 18px 45px var(--shadow);
	}

	.dashboard-card {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
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
		padding-bottom: 10px;
	}

	.tab {
		flex: 1 1 auto;
		font-family: 'Cinzel', serif;
		font-size: 0.95rem;
		padding: 8px 14px;
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
		line-height: 1.6;
	}

	.leaderboard-toolbar {
		flex-wrap: wrap;
		align-items: center;
		/* The card clips overflow; keep the toolbar at its natural height so its rows
		   (filters + actions) are never squeezed and the Refresh button isn't cut off. */
		flex-shrink: 0;
	}

	.leaderboard-filter {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}

	.username-search {
		min-width: 200px;
	}

	/* Refresh + contributor count on their own row, button left and count right. */
	.toolbar-actions {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: 1 1 100%;
	}

	.leaderboard-summary {
		margin-left: auto;
		color: var(--muted-ink, #6c5b4d);
		font-size: 13px;
	}

	.leaderboard-totals {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		flex-shrink: 0;
	}

	.total-stat {
		flex: 1 1 0;
		min-width: 7rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 0.75rem 1rem;
		border: 1px solid rgba(36, 27, 22, 0.16);
		border-radius: 12px;
		background: rgba(255, 250, 240, 0.7);
	}

	.total-stat.approved {
		border-color: rgba(47, 138, 100, 0.45);
		background: rgba(47, 138, 100, 0.1);
	}

	.total-stat.rejected {
		border-color: rgba(184, 69, 49, 0.4);
		background: rgba(184, 69, 49, 0.08);
	}

	.total-value {
		font-family: 'Cinzel', serif;
		font-size: 1.5rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.total-label {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--muted-ink, #6c5b4d);
	}

	.rejected-cell {
		color: var(--ember, #b84531);
	}

	/* The table scrolls inside the card — vertically for long boards, horizontally on
	   narrow screens — so the scrollbar belongs to the card, not the page edge. */
	.table-scroll {
		flex: 1 1 auto;
		min-height: 0;
		overflow: auto;
		border-radius: 12px;
		-webkit-overflow-scrolling: touch;
		/* Slim, parchment-toned scrollbar instead of the default chrome. */
		scrollbar-width: thin;
		scrollbar-color: color-mix(in srgb, var(--panel-line) 85%, transparent) transparent;
	}

	.table-scroll::-webkit-scrollbar {
		width: 10px;
		height: 10px;
	}

	.table-scroll::-webkit-scrollbar-thumb {
		background: var(--panel-line);
		border: 2px solid transparent;
		border-radius: 999px;
		background-clip: padding-box;
	}

	.table-scroll::-webkit-scrollbar-thumb:hover {
		background: color-mix(in srgb, var(--panel-line) 75%, black);
	}

	.table-scroll::-webkit-scrollbar-track {
		background: transparent;
	}

	.leaderboard-table {
		width: 100%;
		/* Below this the columns would crush, so scroll horizontally instead. */
		min-width: 480px;
		border-collapse: collapse;
		background: rgba(255, 250, 240, 0.7);
		border: 1px solid rgba(36, 27, 22, 0.16);
		border-radius: 12px;
		overflow: hidden;
		font-variant-numeric: tabular-nums;
	}

	.leaderboard-table th,
	.leaderboard-table td {
		padding: 0.6rem 0.9rem;
		text-align: left;
		border-bottom: 1px solid rgba(36, 27, 22, 0.1);
	}

	.leaderboard-table th {
		font-family: 'Cinzel', serif;
		font-size: 0.85rem;
		letter-spacing: 0.4px;
		color: var(--muted-ink, #6c5b4d);
		/* Keep the header visible while the body scrolls; opaque so rows don't bleed through. */
		position: sticky;
		top: 0;
		z-index: 1;
		background: #f6efdc;
	}

	.leaderboard-table tbody tr:last-child td {
		border-bottom: none;
	}

	.leaderboard-table tbody tr:nth-child(even) {
		background: rgba(36, 27, 22, 0.035);
	}

	.rank-col {
		width: 4.5rem;
	}

	.num-col {
		text-align: right;
		width: 6rem;
	}

	.num-col.active {
		font-weight: 700;
	}

	.rank {
		font-weight: 600;
	}

	.name-col {
		overflow-wrap: anywhere;
	}

	.anonymous .name-col {
		font-style: italic;
		color: var(--muted-ink, #6c5b4d);
	}

	.no-title {
		color: var(--muted-ink, #6c5b4d);
	}

	/* Earned titles, escalating in prominence. */
	.title {
		font-family: 'Cinzel', serif;
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.3px;
		white-space: nowrap;
		padding: 1px 8px;
		border-radius: 999px;
		border: 1px solid currentColor;
	}

	.title-witch-apprentice {
		color: #5b7a8a;
	}

	.title-witch {
		color: #7a4fa3;
	}

	.title-witch-master {
		color: #b8860b;
		background: rgba(184, 134, 11, 0.12);
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

		/* Keep the three tallies on one row, just smaller. */
		.total-stat {
			min-width: 0;
			padding: 0.6rem 0.4rem;
		}

		.total-value {
			font-size: 1.2rem;
		}

		.total-label {
			font-size: 0.7rem;
		}

		.leaderboard-table th,
		.leaderboard-table td {
			padding: 0.5rem 0.6rem;
		}
	}
</style>
