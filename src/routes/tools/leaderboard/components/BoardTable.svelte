<!--
@component
The ranked leaderboard table, shared by both boards. It owns the scrolling shell, sticky
header, medal/rank column, and the Approved/Rejected/Total numeric columns; callers pass
pre-ranked {@link BoardRow}s and choose whether to show the Title column (contributors only).
-->
<script lang="ts">
	import { medal, titleClass } from '../leaderboard.js';
	import type { BoardRow, RankBy } from '../leaderboard-state.svelte.js';

	interface Props {
		rows: BoardRow[];
		rankBy: RankBy;
		/** Label for the identity column header (e.g. "Discord" or "Sign"). */
		nameHeader: string;
		/** Whether to render the earned-title column (contributors board only). */
		showTitle?: boolean;
	}

	let { rows, rankBy, nameHeader, showTitle = false }: Props = $props();
</script>

<div class="table-scroll">
	<table class="leaderboard-table">
		<thead>
			<tr>
				<th class="rank-col">#</th>
				<th>{nameHeader}</th>
				{#if showTitle}<th>Title</th>{/if}
				<th class="num-col" aria-sort={rankBy === 'approved' ? 'descending' : 'none'}>Approved</th>
				<th class="num-col">Rejected</th>
				<th class="num-col" aria-sort={rankBy === 'total' ? 'descending' : 'none'}>Total</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as row (row.key)}
				<tr class:anonymous={row.muted}>
					<td class="rank-col"><span class="rank">{medal(row.rank)} {row.rank}</span></td>
					<td class="name-col">{row.name}</td>
					{#if showTitle}
						<td class="title-col">
							{#if row.title}<span class={titleClass(row.title)}>{row.title}</span>{:else}<span
									class="no-title">—</span
								>{/if}
						</td>
					{/if}
					<td class="num-col" class:active={rankBy === 'approved'}>{row.approved}</td>
					<td class="num-col rejected-cell">{row.rejected}</td>
					<td class="num-col" class:active={rankBy === 'total'}>{row.total}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
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

	.rejected-cell {
		color: var(--ember, #b84531);
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

	@media (max-width: 640px) {
		.leaderboard-table th,
		.leaderboard-table td {
			padding: 0.5rem 0.6rem;
		}
	}
</style>
