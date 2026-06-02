import { CONFIG } from "../src/lib/config.js";
import { DrawingCapture } from "../src/lib/input/drawingCapture.js";
import { createStrokeStore } from "../src/lib/input/strokeStore.js";
import { normalizeStrokesForTemplate } from "../src/lib/parser/templateNormalizer.js";
import { drawStrokes } from "../src/lib/renderer/glyphOverlayRenderer.js";
import { drawPaper } from "../src/lib/renderer/paperRenderer.js";

const elements = {
  canvas: document.querySelector("#templateCanvas"),
  undoButton: document.querySelector("#undoButton"),
  clearButton: document.querySelector("#clearButton"),
  exportButton: document.querySelector("#exportButton"),
  copyButton: document.querySelector("#copyButton"),
  output: document.querySelector("#templateOutput"),
  statusPill: document.querySelector("#statusPill")
};

const store = createStrokeStore();
const ctx = elements.canvas.getContext("2d");
let capture = null;

function setStatus(text, className = "") {
  elements.statusPill.textContent = text;
  elements.statusPill.className = `status-pill ${className}`.trim();
}

function render() {
  drawPaper(ctx, elements.canvas.width, elements.canvas.height);
  drawStrokes(ctx, store.getStrokes(), capture?.getCurrentStroke(), CONFIG);

  ctx.save();
  ctx.strokeStyle = "rgba(36, 27, 22, 0.24)";
  ctx.lineWidth = 1;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(elements.canvas.width / 2, 0);
  ctx.lineTo(elements.canvas.width / 2, elements.canvas.height);
  ctx.moveTo(0, elements.canvas.height / 2);
  ctx.lineTo(elements.canvas.width, elements.canvas.height / 2);
  ctx.stroke();
  ctx.restore();

  requestAnimationFrame(render);
}

function buildTemplateExport() {
  const rawStrokes = store.getStrokes();
  return normalizeStrokesForTemplate(rawStrokes, {
    samplesPerStroke: 32,
    digits: 4
  });
}

function exportTemplate() {
  const exported = buildTemplateExport();
  elements.output.value = JSON.stringify(exported, null, 2);
  setStatus("Reference exported", "prepared");
}

async function copyTemplate() {
  if (!elements.output.value.trim()) {
    exportTemplate();
  }
  try {
    await navigator.clipboard.writeText(elements.output.value);
    setStatus("Copied", "active");
  } catch {
    setStatus("Copy blocked", "invalid");
  }
}

function setupControls() {
  elements.undoButton.addEventListener("click", () => {
    store.undo();
  });
  elements.clearButton.addEventListener("click", () => {
    store.clear();
    elements.output.value = "";
    setStatus("Cleared");
  });
  elements.exportButton.addEventListener("click", exportTemplate);
  elements.copyButton.addEventListener("click", copyTemplate);
}

function init() {
  capture = new DrawingCapture(elements.canvas, store, CONFIG, {
    onCommit: () => {
      setStatus("Drawing captured", "prepared");
    }
  });
  capture.enable();
  setupControls();
  setStatus("Ready");
  requestAnimationFrame(render);
}

init();
