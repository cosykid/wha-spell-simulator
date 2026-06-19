<script lang="ts">
	import { meterLevel, meterPercent, type SpellSummary } from '$lib/ui/spellSummary.js';

	interface Props {
		summary: SpellSummary;
		showGuides?: boolean;
		showDiagnostics?: boolean;
		onToggleGuides?: () => void;
	}

	let {
		summary,
		showGuides = $bindable(),
		showDiagnostics = $bindable(),
		onToggleGuides
	}: Props = $props();

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
				bind:checked={showGuides}
				onchange={onToggleGuides}
			/>
			<span>Guides</span>
		</label>
		<label class="toggle">
			<input type="checkbox" id="diagnosticsToggle" bind:checked={showDiagnostics} />
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
