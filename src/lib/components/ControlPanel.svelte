<script lang="ts">
	import { meterLevel, meterPercent } from '$lib/ui/spellSummary.js';

	interface Summary {
		statusText: string;
		statusClass: string;
		element: string;
		manifestation: string;
		quality: number;
		stability: number;
		force: number;
		[key: string]: unknown;
	}

	interface Props {
				summary: Summary;
				showGuides?: boolean;
				showDiagnostics?: boolean;
				showPaper?: boolean;
				onToggleGuides?: () => void;
				onSpawnPaper?: () => void;
				onCastFire?: () => void;
			}

	let {
			summary,
			showGuides = $bindable(),
			showDiagnostics = $bindable(),
			showPaper = $bindable(),
			onToggleGuides,
			onSpawnPaper,
			onCastFire
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

		<label class="toggle">
			<input type="checkbox" id="paperToggle" bind:checked={showPaper} />
			<span>Spawn Paper</span>
		</label>

		<div class="small-actions">
			<button type="button" class="tool-btn" onclick={() => onSpawnPaper?.()} title="Spawn a paper now">
				Spawn Paper Now
			</button>
			<button type="button" class="tool-btn" onclick={() => onCastFire?.()} title="Cast a demo fire spell (shortcut: F)">
				Cast Fire (F)
			</button>
		</div>
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
