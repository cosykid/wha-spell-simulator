<!--
@component
Bottom-left spell meters: Quality, Stability, and Force, each drawn as a row of
diamond pips that fill in proportion to the value. The exact percentage stays in
the DOM as a test hook but is never shown; the pips alone communicate the rating.
The ink is dark sepia while drawing, then flips to pale parchment once the spell
goes active and its effect darkens this corner, so the ratings stay readable
without a backing panel.
-->
<script lang="ts">
	import { meterPercent, meterPips } from '$lib/ui/spellSummary.js';
	import type { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';

	interface Props {
		simulator: SimulatorSession;
	}

	let { simulator }: Props = $props();
	let summary = $derived(simulator.recognition.summary);

	const PIP_COUNT = 10;
	const pipIndexes = Array.from({ length: PIP_COUNT }, (_, i) => i);

	const meters = $derived([
		{ label: 'Quality', value: summary.quality },
		{ label: 'Stability', value: summary.stability },
		{ label: 'Force', value: summary.force }
	]);

	// While a spell is active its effect darkens this corner, so the ink flips pale.
	let active = $derived(summary.portalActive);
</script>

<div class="meter-list" class:active aria-label="Spell meters">
	{#each meters as meter (meter.label)}
		{@const filled = meterPips(meter.value, PIP_COUNT)}
		<div class="meter-row" data-testid="meter-{meter.label.toLowerCase()}">
			<span class="meter-label">{meter.label}</span>
			<div class="pip-row" role="img" aria-label="{meter.label} {filled} of {PIP_COUNT}">
				{#each pipIndexes as i (i)}
					<span class="pip" class:filled={i < filled}></span>
				{/each}
			</div>
			<span class="meter-value sr-only" data-testid="meter-value-{meter.label.toLowerCase()}"
				>{meterPercent(meter.value)}</span
			>
		</div>
	{/each}
</div>

<style>
	/*
	 * The ink colour is a CSS variable so a single `.active` switch flips the
	 * label and every pip from dark sepia (on parchment) to pale parchment (on the
	 * dark active-spell effect) together. A short transition rides the fade.
	 */
	.meter-list {
		--meter-ink: var(--ink-sepia);
		--meter-ink-soft: var(--ink-sepia-45);
		display: grid;
		gap: 13px;
	}

	.meter-list.active {
		--meter-ink: var(--panel);
		--meter-ink-soft: rgba(242, 236, 214, 0.5);
	}

	.meter-row {
		display: grid;
		gap: 2px;
	}

	.meter-label {
		font-family: 'Cinzel', serif;
		font-size: 10px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--meter-ink);
		transition: color 240ms ease;
	}

	.pip-row {
		display: flex;
		gap: 7px;
	}

	.pip {
		width: 7px;
		height: 7px;
		transform: rotate(45deg);
		border: 1.6px solid var(--meter-ink-soft);
		background: transparent;
		transition:
			border-color 240ms ease,
			background-color 240ms ease;
	}

	.pip.filled {
		border-color: var(--meter-ink);
		background: var(--meter-ink);
	}

	/* Exact percentage: kept in the DOM as a test hook only, never shown. */
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
