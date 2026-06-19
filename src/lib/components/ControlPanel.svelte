<script lang="ts">
	import { meterLevel, meterPercent } from '$lib/ui/spellSummary.js';
	import type { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';

	interface Props {
		simulator: SimulatorSession;
	}

	let { simulator }: Props = $props();
	let ui = $derived(simulator.ui);
	let summary = $derived(simulator.recognition.summary);

	const meters = $derived([
		{ label: 'Quality', value: summary.quality },
		{ label: 'Stability', value: summary.stability },
		{ label: 'Force', value: summary.force }
	]);
</script>

<aside class="control-panel" aria-label="Spell controls">
	<section class="control-section">
		<label class="toggle">
			<input
				type="checkbox"
				id="guidesToggle"
				bind:checked={ui.showGuides}
				onchange={simulator.handleToggleGuides}
			/>
			<span>Guides</span>
		</label>
		<label class="toggle">
			<input type="checkbox" id="diagnosticsToggle" bind:checked={ui.showDiagnostics} />
			<span>Glyph Diagnostics</span>
		</label>
	</section>

	<h2 class="panel-section-title">Spell State</h2>
	<div
		class="spell-state-status {summary.statusClass}"
		id="statusValue"
		data-testid="status-value"
		data-status-class={summary.statusClass}
	>
		{summary.statusText}
	</div>
	<section class="summary-band">
		<div>
			<span class="label">Element</span>
			<strong id="elementValue" data-testid="element-value">{summary.element}</strong>
		</div>
		<div>
			<span class="label">Manifestations</span>
			<strong id="manifestationValue" data-testid="manifestation-value"
				>{summary.manifestation}</strong
			>
		</div>
	</section>

	<section class="meter-list">
		{#each meters as meter (meter.label)}
			<div class="meter-row" data-testid="meter-{meter.label.toLowerCase()}">
				<span>{meter.label}</span>
				<div class="meter">
					<span style="width: {meterPercent(meter.value)}" data-level={meterLevel(meter.value)}
					></span>
				</div>
				<span class="diagnostic-meter-value" data-testid="meter-value-{meter.label.toLowerCase()}"
					>{meterPercent(meter.value)}</span
				>
			</div>
		{/each}
	</section>
</aside>

<style>
	.control-panel {
		overflow-y: auto;
		scrollbar-width: none;
	}

	.control-panel::-webkit-scrollbar {
		width: 0;
		height: 0;
	}

	.control-section {
		display: grid;
		gap: 10px;
		border-bottom: 1px solid rgba(36, 27, 22, 0.16);
		padding-bottom: 14px;
		margin-bottom: 14px;
	}

	.panel-section-title {
		margin: 10px 0 10px;
		font-family: 'Cinzel', serif;
		color: var(--muted-ink);
		font-size: 16px;
		font-weight: 600;
		letter-spacing: 0;
		text-transform: uppercase;
	}

	/* `button` is :global so a control placed in a section (incl. via a child
	   component) still spans full width without tripping unused-selector checks. */
	.control-section :global(button),
	.control-section .toggle {
		width: 100%;
	}

	.control-section .toggle {
		gap: 6px;
		justify-content: space-between;
		padding: 0 10px;
	}

	.control-section .toggle span {
		white-space: nowrap;
	}

	.spell-state-status {
		min-width: 0;
		width: 100%;
		max-width: 100%;
		margin: 8px 0 18px;
		padding: 0;
		border: 0;
		border-radius: 0;
		font-size: 13px;
		font-weight: 600;
		text-align: left;
		color: var(--ink);
		background: transparent;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		box-shadow: none;
	}

	.spell-state-status::before {
		content: '';
		width: 9px;
		height: 9px;
		flex: 0 0 auto;
		border-radius: 999px;
		background: rgba(36, 27, 22, 0.38);
	}

	.spell-state-status.active::before {
		background: var(--teal);
	}

	.spell-state-status.prepared::before {
		background: var(--teal);
	}

	.spell-state-status.invalid::before {
		background: #8d5149;
	}

	.spell-state-status.closed::before {
		background: #5f4bd4;
	}

	.spell-state-status.active,
	.spell-state-status.prepared,
	.spell-state-status.invalid,
	.spell-state-status.closed {
		border: 0;
		color: var(--ink);
		background: transparent;
	}

	.summary-band {
		display: grid;
		grid-template-columns: 1fr;
		gap: 10px;
		border-bottom: 1px solid rgba(36, 27, 22, 0.16);
		padding-bottom: 14px;
	}

	.summary-band div {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 14px;
	}

	.summary-band strong {
		font-size: 14px;
		text-align: right;
		color: var(--teal);
	}

	.meter-list {
		display: grid;
		gap: 12px;
		padding: 16px 0;
	}

	.meter-row {
		display: grid;
		grid-template-columns: 82px minmax(0, 1fr);
		gap: 10px;
		align-items: center;
		color: var(--muted-ink);
		font-size: 14px;
	}

	:global(.diagnostics-visible) .meter-row {
		grid-template-columns: 82px minmax(0, 1fr) auto;
	}

	.diagnostic-meter-value {
		display: none;
		min-width: 34px;
		text-align: right;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}

	:global(.diagnostics-visible) .diagnostic-meter-value {
		display: inline;
	}

	.meter {
		height: 9px;
		overflow: hidden;
		border-radius: 999px;
		background: rgba(36, 27, 22, 0.14);
	}

	.meter span {
		display: block;
		width: 0%;
		height: 100%;
		border-radius: inherit;
		background: var(--ember);
		transition: width 160ms ease;
	}

	.meter span[data-level='low'] {
		background: #b84531;
	}

	.meter span[data-level='medium'] {
		background: #d4a13d;
	}

	.meter span[data-level='high'] {
		background: #2f8a64;
	}
</style>
