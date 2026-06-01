<script>
  let { dictionary = null } = $props();

  let activeTab = $state("sample");

  const sampleSpells = $derived(dictionary?.sampleSpells ?? []);
  const sigils = $derived(dictionary?.sigils ?? []);
  const signs = $derived(dictionary?.signs ?? []);

  // Project normalized 0..1 stroke points into the 100x100 preview viewBox,
  // matching the original 8 + value * 84 inset mapping.
  function toPolylines(strokes) {
    if (!strokes?.length) {
      return [];
    }
    return strokes
      .map((stroke) =>
        stroke
          .map((point) => {
            const x = Number(point.x);
            const y = Number(point.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
              return null;
            }
            const previewX = 8 + x * 84;
            const previewY = 8 + y * 84;
            return `${Math.round(previewX * 10) / 10},${Math.round(previewY * 10) / 10}`;
          })
          .filter(Boolean)
          .join(" ")
      )
      .filter((points) => points.length > 0);
  }
</script>

{#snippet strokePreview(strokes)}
  {@const polylines = toPolylines(strokes)}
  {#if polylines.length}
    <div class="reference-preview" aria-hidden="true">
      <svg viewBox="0 0 100 100" role="img" focusable="false">
        {#each polylines as points}
          <polyline {points}></polyline>
        {/each}
      </svg>
    </div>
  {/if}
{/snippet}

{#snippet referenceCard(entry, kind)}
  {@const template = entry.strokeTemplate ?? null}
  {@const hasTemplate = Boolean(template?.strokes?.length)}
  <article class="reference-card {hasTemplate ? 'has-template' : ''}">
    {@render strokePreview(template?.strokes)}
    <div>
      <div class="reference-card-header">
        <strong>{entry.displayName ?? entry.id}</strong>
        {#if kind === "sigil" && entry.element}<span>{entry.element}</span>{/if}
      </div>
      <dl>
        <div><dt>Layers</dt><dd>{entry.allowedLayers?.join(", ") || "any"}</dd></div>
        <div><dt>Recognition</dt><dd>{hasTemplate ? "stroke reference" : "not configured"}</dd></div>
      </dl>
      {#if kind === "sign" && entry.sourceNotes}
        <details class="reference-source">
          <summary>Source notes</summary>
          <p>{entry.sourceNotes}</p>
        </details>
      {/if}
    </div>
  </article>
{/snippet}

{#snippet sampleCard(sample)}
  {@const hasTemplate = Boolean(sample.strokes?.length)}
  {@const manifestations = sample.manifestations?.length ? sample.manifestations.join(", ") : "none"}
  <article class="reference-card {hasTemplate ? 'has-template' : ''}">
    {@render strokePreview(sample.strokes)}
    <div>
      <div class="reference-card-header">
        <strong>{sample.displayName ?? sample.id}</strong>
        {#if sample.element}<span>{sample.element}</span>{/if}
      </div>
      <p class="reference-card-description">{sample.description}</p>
      <dl>
        <div><dt>Element</dt><dd>{sample.element ?? "none"}</dd></div>
        <div><dt>Manifestations</dt><dd>{manifestations}</dd></div>
      </dl>
    </div>
  </article>
{/snippet}

<section class="reference-panel" aria-label="Dictionary reference">
  <div class="reference-tabs">
    <button type="button" class="dictionary-tab-button" class:active={activeTab === "sample"} onclick={() => (activeTab = "sample")}>
      Sample Spells
    </button>
    <button type="button" class="dictionary-tab-button" class:active={activeTab === "sigils"} onclick={() => (activeTab = "sigils")}>
      Sigils
    </button>
    <button type="button" class="dictionary-tab-button" class:active={activeTab === "signs"} onclick={() => (activeTab = "signs")}>
      Signs
    </button>
  </div>

  <div class="reference-list" hidden={activeTab !== "sample"}>
    <p class="panel-description">
      Sample spells show complete seal layouts you can use as drawing references.
    </p>
    <div>
      {#each sampleSpells as sample (sample.id)}
        {@render sampleCard(sample)}
      {/each}
    </div>
  </div>

  <div class="reference-list" hidden={activeTab !== "sigils"}>
    <p class="panel-description">
      Sigils, typically placed in the center of a seal, control what type of spell a seal will generate.
    </p>
    <div>
      {#each sigils as entry (entry.id)}
        {@render referenceCard(entry, "sigil")}
      {/each}
    </div>
  </div>

  <div class="reference-list" hidden={activeTab !== "signs"}>
    <p class="panel-description">
      Signs control what form spells will take. They serve as modifiers, allowing the effect of a spell to be altered.
    </p>
    <div>
      {#each signs as entry (entry.id)}
        {@render referenceCard(entry, "sign")}
      {/each}
    </div>
  </div>
</section>
