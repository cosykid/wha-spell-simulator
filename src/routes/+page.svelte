<script>
  import { onMount } from "svelte";
  import { base } from "$app/paths";

  import { CONFIG } from "$lib/config.js";
  import { compileSpell } from "$lib/compiler/spellBuilder.js";
  import { buildDiagnosticState } from "$lib/debug/diagnosticState.js";
  import { loadDictionary } from "$lib/dictionary/dictionaryLoader.js";
  import { DrawingCapture } from "$lib/input/drawingCapture.js";
  import { createStrokeStore } from "$lib/input/strokeStore.js";
  import { classifyDrawing } from "$lib/parser/drawingClassifier.js";
  import { CanvasRenderer } from "$lib/renderer/canvasRenderer.js";
  import { setupCanvasSizing } from "$lib/ui/canvasSizing.js";
  import { computeSummary, INITIAL_SUMMARY } from "$lib/ui/spellSummary.js";

  import ControlPanel from "$lib/components/ControlPanel.svelte";
  import DictionaryReference from "$lib/components/DictionaryReference.svelte";
  import Diagnostics from "$lib/components/Diagnostics.svelte";

  // Reactive UI state.
  let dictionary = $state(null);
  let summary = $state({ ...INITIAL_SUMMARY });
  let diagnostics = $state({ ast: null, ir: null, parser: null });
  let showGuides = $state(true);
  let showDiagnostics = $state(false);
  let rootTab = $state("dictionary");

  // Bound DOM nodes.
  let glyphCanvas;
  let effectCanvas;
  let canvasShell;

  // Imperative pipeline state (read by the render loop, not the template).
  const store = createStrokeStore();
  let renderer = null;
  let capture = null;
  let pipeline = null;
  let spellIR = null;
  let previousRing = null;
  let resizeObserver = null;
  let rafId = null;

  function buildDiagnostics() {
    const state = buildDiagnosticState({
      rawStrokes: store.getStrokes(),
      pipeline,
      spellIR
    });
    return {
      ast: state.glyphAST,
      ir: state.spellIR,
      parser: {
        rawStrokes: state.rawStrokes,
        ring: state.ring,
        classifications: state.classifications,
        candidates: state.candidates,
        recognitions: state.recognitions
      }
    };
  }

  function recompute() {
    if (!dictionary) {
      return;
    }

    pipeline = classifyDrawing({
      strokes: store.getStrokes(),
      previousRing,
      dictionary,
      config: CONFIG
    });
    previousRing = pipeline.ring;
    spellIR = compileSpell({ glyphAST: pipeline.glyphAST, dictionary, config: CONFIG });
    summary = computeSummary({ store, pipeline, spellIR, showGuides });
    capture?.setLocked(summary.inputLocked);
    diagnostics = buildDiagnostics();
  }

  function animationFrame(timestamp) {
    renderer.renderGlyph({
      strokes: store.getStrokes(),
      currentStroke: capture.getCurrentStroke(),
      pipeline,
      showGuides,
      showDebug: showDiagnostics
    });

    if (spellIR?.active) {
      renderer.renderActivatedGlyph({
        activatedAt: spellIR.activatedAt,
        duration: spellIR.duration,
        strokes: store.getStrokes(),
        pipeline,
        timestamp
      });
    }

    renderer.renderEffect({
      spellIR,
      ring: pipeline?.ring,
      timestamp,
      showGuides
    });
    rafId = requestAnimationFrame(animationFrame);
  }

  function handleUndo() {
    store.undo();
    previousRing = null;
    recompute();
  }

  function handleClear() {
    store.clear();
    previousRing = null;
    recompute();
  }

  function handleToggleGuides() {
    // Guides only affect the canvas hint visibility and guide rendering;
    // refresh the summary without re-running the parser pipeline.
    if (dictionary) {
      summary = computeSummary({ store, pipeline, spellIR, showGuides });
    }
  }

  // Mirror the original `body.diagnostics-visible` toggle the debug CSS keys off.
  $effect(() => {
    document.body.classList.toggle("diagnostics-visible", showDiagnostics);
    return () => document.body.classList.remove("diagnostics-visible");
  });

  onMount(() => {
    renderer = new CanvasRenderer({ glyphCanvas, effectCanvas, config: CONFIG });
    capture = new DrawingCapture(glyphCanvas, store, CONFIG, {
      onPreview: () => {},
      onCommit: recompute
    });
    resizeObserver = setupCanvasSizing({
      elements: { canvasShell, glyphCanvas, effectCanvas },
      store,
      onCanvasResized: () => {
        previousRing = null;
        recompute();
      }
    });

    let cancelled = false;
    (async () => {
      try {
        dictionary = await loadDictionary();
        capture.enable();
        recompute();
        if (!cancelled) {
          rafId = requestAnimationFrame(animationFrame);
        }
      } catch (error) {
        console.error(error);
        summary = { ...summary, statusText: "Dictionary load failed", statusClass: "invalid" };
      }
    })();

    return () => {
      cancelled = true;
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      capture?.disable();
      resizeObserver?.disconnect();
    };
  });
</script>

<svelte:head>
  <title>Witch Hat Atelier Spell Simulator</title>
</svelte:head>

<div class="app-shell">
  <header class="app-header">
    <div>
      <p class="eyebrow">Glyph Compiler</p>
      <h1>Witch Hat Atelier Spell Simulator</h1>
    </div>
    <div class="header-actions">
      <a class="header-link" href="{base}/tools">Tools</a>
      <a class="header-link" href="https://github.com/ytnrvdf/wha-spell-simulator" target="_blank" rel="noreferrer">GitHub</a>
    </div>
  </header>

  <main class="workspace">
    <ControlPanel
      {summary}
      bind:showGuides
      bind:showDiagnostics
      onUndo={handleUndo}
      onClear={handleClear}
      onToggleGuides={handleToggleGuides}
    />

    <section class="canvas-panel" aria-label="Spell drawing surface">
      <div class="canvas-shell" bind:this={canvasShell} class:portal-active={summary.portalActive}>
        <p class="canvas-hint" id="canvasHint" class:hidden={summary.hintHidden}>
          Draw an open spell ring. Place sigils in the center and signs around them.
          When everything is ready, seal the circle to awaken the spell.
        </p>
        <canvas id="glyphCanvas" bind:this={glyphCanvas} class:locked={summary.inputLocked} width="1200" height="800"></canvas>
        <canvas id="effectCanvas" bind:this={effectCanvas} width="1200" height="800"></canvas>
      </div>
    </section>

    <aside class="dictionary-panel" aria-label="Dictionary and diagnostics">
      <div class="panel-tabs">
        <button type="button" class="panel-tab-button" class:active={rootTab === "dictionary"} onclick={() => (rootTab = "dictionary")}>
          Dictionary
        </button>
        <button type="button" class="panel-tab-button" class:active={rootTab === "diagnostic"} onclick={() => (rootTab = "diagnostic")}>
          Diagnostic
        </button>
      </div>

      <section id="dictionaryRootPanel" hidden={rootTab !== "dictionary"}>
        <DictionaryReference {dictionary} />
      </section>

      <section id="diagnosticRootPanel" hidden={rootTab !== "diagnostic"}>
        <Diagnostics {diagnostics} />
      </section>
    </aside>
  </main>

  <footer class="app-footer">
    <p>
      Unofficial fan-made spell diagram simulator inspired by Witch Hat Atelier. This project is not affiliated with,
      endorsed by, or sponsored by the official creators, publishers, licensors, or production partners.
    </p>
    <p>
      Witch Hat Atelier and related names, artwork, symbols, and trademarks belong to their respective rights
      holders. The sigils, signs, and spell effects here are partial fan references and programming-language
      interpretations for learning and experimentation.
    </p>
  </footer>
</div>
