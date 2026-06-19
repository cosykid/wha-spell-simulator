<!--
@component
The three aggregate tallies (Drawings / Approved / Rejected) shown above a board's table.
Shared by both the Contributors and Signs boards.
-->
<script lang="ts">
	interface Props {
		drawings: number;
		approved: number;
		rejected: number;
	}

	let { drawings, approved, rejected }: Props = $props();
</script>

<div class="leaderboard-totals">
	<div class="total-stat">
		<span class="total-value">{drawings}</span>
		<span class="total-label">Drawings</span>
	</div>
	<div class="total-stat approved">
		<span class="total-value">{approved}</span>
		<span class="total-label">Approved</span>
	</div>
	<div class="total-stat rejected">
		<span class="total-value">{rejected}</span>
		<span class="total-label">Rejected</span>
	</div>
</div>

<style>
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
		flex-direction: row;
		align-items: baseline;
		justify-content: center;
		gap: 0.4rem;
		padding: 0.35rem 1rem;
		border: 1px solid rgba(36, 27, 22, 0.16);
		border-radius: 10px;
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
		font-size: 1.3rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.total-label {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--muted-ink, #6c5b4d);
	}

	@media (max-width: 640px) {
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
	}
</style>
