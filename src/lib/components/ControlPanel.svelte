<script>
  import { meterLevel, meterPercent } from "$lib/ui/spellSummary.js";

  let {
    summary,
    showGuides = $bindable(),
    showDiagnostics = $bindable(),
    onUndo,
    onClear,
    onToggleGuides
  } = $props();

  const meters = $derived([
    { label: "Quality", value: summary.quality },
    { label: "Stability", value: summary.stability },
    { label: "Force", value: summary.force }
  ]);
</script>

<aside class="control-panel" aria-label="Spell controls">
  <section class="control-section">
    <button type="button" id="undoButton" disabled={summary.undoDisabled} onclick={onUndo}>Undo</button>
    <button type="button" id="clearButton" onclick={onClear}>Clear</button>
  </section>

  <section class="control-section">
    <label class="toggle">
      <input type="checkbox" id="guidesToggle" bind:checked={showGuides} onchange={onToggleGuides} />
      <span>Guides</span>
    </label>
    <label class="toggle">
      <input type="checkbox" id="diagnosticsToggle" bind:checked={showDiagnostics} />
      <span>Glyph Diagnostics</span>
    </label>
  </section>

  <h2 class="panel-section-title">Spell State</h2>
  <div class="spell-state-status {summary.statusClass}" id="statusValue">{summary.statusText}</div>
  <section class="summary-band">
    <div>
      <span class="label">Element</span>
      <strong id="elementValue">{summary.element}</strong>
    </div>
    <div>
      <span class="label">Manifestations</span>
      <strong id="manifestationValue">{summary.manifestation}</strong>
    </div>
  </section>

  <section class="meter-list">
    {#each meters as meter (meter.label)}
      <div class="meter-row">
        <span>{meter.label}</span>
        <div class="meter">
          <span style="width: {meterPercent(meter.value)}" data-level={meterLevel(meter.value)}></span>
        </div>
        <span class="diagnostic-meter-value">{meterPercent(meter.value)}</span>
      </div>
    {/each}
  </section>
</aside>
