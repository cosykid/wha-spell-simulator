import { CONFIG } from "../src/lib/config.js";
import { drawPaper } from "../src/lib/renderer/paperRenderer.js";

const elements = {
  canvas: document.querySelector("#previewCanvas"),
  input: document.querySelector("#templateInput"),
  renderButton: document.querySelector("#renderButton"),
  clearButton: document.querySelector("#clearButton"),
  metricsOutput: document.querySelector("#metricsOutput"),
  statusPill: document.querySelector("#statusPill")
};

const ctx = elements.canvas.getContext("2d");

function setStatus(text, className = "") {
  elements.statusPill.textContent = text;
  elements.statusPill.className = `status-pill ${className}`.trim();
}

function clearPreview() {
  drawPaper(ctx, elements.canvas.width, elements.canvas.height);
}

function parseTemplate(value) {
  const parsed = JSON.parse(value);
  return parsed.strokeTemplate ?? parsed;
}

function validateTemplate(template) {
  if (!template || !Array.isArray(template.strokes)) {
    throw new Error("JSON must be a strokeTemplate object or an entry with strokeTemplate.");
  }

  const strokes = template.strokes.map((stroke) => {
    if (!Array.isArray(stroke)) {
      throw new Error("Each stroke must be an array of points.");
    }
    return stroke
      .map((point) => ({
        x: Number(point.x),
        y: Number(point.y)
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  });

  if (!strokes.some((stroke) => stroke.length > 1)) {
    throw new Error("Template must contain at least one stroke with two valid points.");
  }

  return {
    sourceAspectRatio: Number(template.sourceAspectRatio) || 1,
    strokes
  };
}

function drawingBounds(template, width, height) {
  const padding = width * 0.1;
  const availableWidth = width - padding * 2;
  const availableHeight = height - padding * 2;
  const aspect = Math.max(0.1, template.sourceAspectRatio);
  let drawWidth = availableWidth;
  let drawHeight = drawWidth / aspect;

  if (drawHeight > availableHeight) {
    drawHeight = availableHeight;
    drawWidth = drawHeight * aspect;
  }

  return {
    x: (width - drawWidth) / 2,
    y: (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight
  };
}

function templatePointToCanvas(point, bounds) {
  return {
    x: bounds.x + point.x * bounds.width,
    y: bounds.y + point.y * bounds.height
  };
}

function drawTemplate(template) {
  clearPreview();

  const bounds = drawingBounds(template, elements.canvas.width, elements.canvas.height);
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

function templateMetrics(template) {
  const strokeCount = template.strokes.length;
  const pointCount = template.strokes.reduce((sum, stroke) => sum + stroke.length, 0);
  return {
    sourceAspectRatio: Math.round(template.sourceAspectRatio * 1000) / 1000,
    strokeCount,
    pointCount
  };
}

function renderTemplate() {
  try {
    const template = validateTemplate(parseTemplate(elements.input.value));
    drawTemplate(template);
    elements.metricsOutput.textContent = JSON.stringify(templateMetrics(template), null, 2);
    setStatus("Rendered", "prepared");
  } catch (error) {
    clearPreview();
    elements.metricsOutput.textContent = error.message;
    setStatus("Invalid JSON", "invalid");
  }
}

function setupControls() {
  elements.renderButton.addEventListener("click", renderTemplate);
  elements.clearButton.addEventListener("click", () => {
    elements.input.value = "";
    elements.metricsOutput.textContent = "Paste a strokeTemplate object or a full dictionary entry, then click Render.";
    clearPreview();
    setStatus("Ready");
  });
}

function init() {
  clearPreview();
  setupControls();
}

init();
