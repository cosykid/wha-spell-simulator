<script lang="ts">
  import { onMount } from "svelte";
  import { base } from "$app/paths";
  import type { StrokeTemplate } from "$lib/types.js";

  import { CONFIG } from "$lib/config.js";
  import { drawPaper } from "$lib/renderer/paperRenderer.js";
  import {
    drawingBounds,
    parseTemplate,
    templateMetrics,
    templatePointToCanvas,
    validateTemplate
  } from "$lib/ui/strokeTemplateView.js";

  const PLACEHOLDER = "Paste a strokeTemplate object or a full dictionary entry, then click Render.";

  let input = $state("");
  let metrics = $state(PLACEHOLDER);
  let status = $state({ text: "Ready", className: "" });

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;

  function setStatus(text: string, className = "") {
    status = { text, className };
  }

  function clearPreview() {
    if (ctx) {
      drawPaper(ctx, canvas.width, canvas.height);
    }
  }

  function drawTemplate(template: StrokeTemplate) {
    clearPreview();
    if (!ctx) {
      return;
    }

    const bounds = drawingBounds(template, canvas.width, canvas.height);
    ctx.save();
    ctx.strokeStyle = "rgba(36, 27, 22, 0.18)";
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 8]);
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = CONFIG.renderer.inkColor;
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const stroke of template.strokes) {
      if (stroke.length < 2) {
        continue;
      }
      const first = templatePointToCanvas(stroke[0], bounds);
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (let index = 1; index < stroke.length; index += 1) {
        const point = templatePointToCanvas(stroke[index], bounds);
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function renderTemplate() {
    try {
      const template = validateTemplate(parseTemplate(input));
      drawTemplate(template);
      metrics = JSON.stringify(templateMetrics(template), null, 2);
      setStatus("Rendered", "prepared");
    } catch (error) {
      clearPreview();
      metrics = error instanceof Error ? error.message : String(error);
      setStatus("Invalid JSON", "invalid");
    }
  }

  function handleClear() {
    input = "";
    metrics = PLACEHOLDER;
    clearPreview();
    setStatus("Ready");
  }

  onMount(() => {
    ctx = canvas.getContext("2d");
    clearPreview();
  });
</script>

<svelte:head>
  <title>Stroke Template Viewer</title>
</svelte:head>

<div class="app-shell">
  <header class="app-header">
    <div>
      <p class="eyebrow">Template Tool</p>
      <h1>Stroke Template Viewer</h1>
    </div>
    <div class="header-actions">
      <a class="header-link" href="{base}/tools">Tools</a>
      <div class="status-pill {status.className}">{status.text}</div>
    </div>
  </header>

  <main class="workspace maker-workspace">
    <section class="canvas-panel maker-canvas-panel">
      <div class="toolbar">
        <button type="button" onclick={renderTemplate}>Render</button>
        <button type="button" onclick={handleClear}>Clear</button>
      </div>
      <div class="reference-canvas-shell">
        <canvas bind:this={canvas} width="800" height="800"></canvas>
      </div>
    </section>

    <aside class="side-panel">
      <section class="diagnostic-block">
        <h2>Template JSON</h2>
        <textarea class="template-output" spellcheck="false" bind:value={input}></textarea>
      </section>
      <section class="diagnostic-block">
        <h2>Metrics</h2>
        <pre class="diagnostic-output">{metrics}</pre>
      </section>
    </aside>
  </main>
</div>
