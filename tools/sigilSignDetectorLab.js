import { CONFIG } from "../src/lib/config.js";
import { loadDictionary } from "../src/lib/dictionary/dictionaryLoader.js";
import { DrawingCapture } from "../src/lib/input/drawingCapture.js";
import { createStrokeStore } from "../src/lib/input/strokeStore.js";
import {
  allPoints,
  angleDegFromCenter,
  angularDifference,
  boundsForStrokes,
  centerOfBounds,
  clamp,
  degreesToRadians,
  directedStrokeAngle,
  dominantAxisOrientationDeg,
  endpointClosedness,
  strokeLength
} from "../src/lib/utils/geometry.js";
import { cleanStrokes } from "../src/lib/parser/strokeCleaner.js";
import { recognizeCandidates } from "../src/lib/parser/symbolRecognizer.js";
import { scoreStrokeTemplate } from "../src/lib/parser/templateMatcher.js";
import { normalizeStrokesForTemplate } from "../src/lib/parser/templateNormalizer.js";
import { writeJson } from "../src/lib/debug/debugOverlay.js";
import { drawStrokes } from "../src/lib/renderer/glyphOverlayRenderer.js";
import { drawPaper } from "../src/lib/renderer/paperRenderer.js";

const elements = {
  canvas: document.querySelector("#detectorCanvas"),
  statusPill: document.querySelector("#statusPill"),
  undoButton: document.querySelector("#undoButton"),
  clearButton: document.querySelector("#clearButton"),
  dictionaryMode: document.querySelector("#dictionaryMode"),
  referenceOverlay: document.querySelector("#referenceOverlay"),
  paperOverlayToggle: document.querySelector("#paperOverlayToggle"),
  recognizedValue: document.querySelector("#recognizedValue"),
  kindValue: document.querySelector("#kindValue"),
  idValue: document.querySelector("#idValue"),
  confidenceValue: document.querySelector("#confidenceValue"),
  templateValue: document.querySelector("#templateValue"),
  inkValue: document.querySelector("#inkValue"),
  explainedValue: document.querySelector("#explainedValue"),
  rotationValue: document.querySelector("#rotationValue"),
  matchList: document.querySelector("#matchList"),
  recognitionOutput: document.querySelector("#recognitionOutput"),
  candidateOutput: document.querySelector("#candidateOutput")
};

const ctx = elements.canvas.getContext("2d");
const store = createStrokeStore();
let capture = null;
let dictionary = null;
let analysis = null;
const normalizedStrokeTemplateCache = new WeakMap();

function percent(value) {
  return `${Math.round((value ?? 0) * 100)}%`;
}

function rounded(value) {
  if (Array.isArray(value)) {
    return value.map(rounded);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rounded(item)]));
  }
  return typeof value === "number" ? Math.round(value * 1000) / 1000 : value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function setStatus(text, className = "") {
  elements.statusPill.textContent = text;
  elements.statusPill.className = `status-pill ${className}`.trim();
}

function statusLabel(status) {
  switch (status) {
    case "valid_messy":
      return "Valid Messy";
    case "contaminated":
      return "Contaminated";
    case "ambiguous":
      return "Ambiguous";
    case "valid":
      return "Recognized";
    case "unknown":
    default:
      return "No Confident Match";
  }
}

function statusClass(status, recognized) {
  if (status === "contaminated" || status === "unknown") {
    return "invalid";
  }
  if (status === "valid_messy" || status === "ambiguous") {
    return "prepared";
  }
  return recognized ? "active" : "";
}

function activeDictionary() {
  if (!dictionary) {
    return { sigils: [], signs: [] };
  }

  const mode = elements.dictionaryMode.value;
  return {
    sigils: mode === "signs" ? [] : dictionary.sigils,
    signs: mode === "sigils" ? [] : dictionary.signs
  };
}

function selectedReferenceEntry() {
  if (!elements.paperOverlayToggle.checked) {
    return null;
  }

  const id = elements.referenceOverlay.value;
  if (!id || !dictionary?.sigils?.length) {
    return null;
  }
  return dictionary.sigils.find((entry) => entry.id === id) ?? null;
}

function populateReferenceOverlay() {
  const options = [
    `<option value="">No trace reference</option>`,
    ...(dictionary?.sigils ?? [])
      .filter((entry) => entry.strokeTemplate?.strokes?.length)
      .map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.displayName ?? entry.id)}</option>`)
  ];
  elements.referenceOverlay.innerHTML = options.join("");
}

function classifyRadialFacing(directedAngle, radialAngle) {
  const outward = angularDifference(directedAngle, radialAngle);
  const inward = angularDifference(directedAngle, radialAngle + 180);
  const counterclockwise = angularDifference(directedAngle, radialAngle + 90);
  const clockwise = angularDifference(directedAngle, radialAngle - 90);
  const best = Math.min(outward, inward, counterclockwise, clockwise);

  if (best > 48) {
    return "unclear";
  }
  if (best === outward) {
    return "outward";
  }
  if (best === inward) {
    return "inward";
  }
  if (best === counterclockwise) {
    return "counterclockwise";
  }
  return "clockwise";
}

function rotateTemplatePoint(point, degrees) {
  if (!degrees) {
    return point;
  }

  const radians = degreesToRadians(-degrees);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const x = point.x - 0.5;
  const y = point.y - 0.5;
  return {
    x: x * cos - y * sin + 0.5,
    y: x * sin + y * cos + 0.5
  };
}

function templatePointToCanvas(point, candidate, rotationDeg) {
  const rotated = rotateTemplatePoint(point, rotationDeg);
  const scale = Math.max(candidate.bounds.width, candidate.bounds.height, 1);
  return {
    x: candidate.center.x + (rotated.x - 0.5) * scale,
    y: candidate.center.y + (rotated.y - 0.5) * scale
  };
}

function normalizedTemplateStrokes(strokeTemplate) {
  if (!strokeTemplate?.strokes?.length) {
    return [];
  }

  const cached = normalizedStrokeTemplateCache.get(strokeTemplate);
  if (cached) {
    return cached;
  }

  const normalized = normalizeStrokesForTemplate(strokeTemplate.strokes, {
    samplesPerStroke: 40,
    fitToBounds: true,
    digits: 5
  }).strokes;
  normalizedStrokeTemplateCache.set(strokeTemplate, normalized);
  return normalized;
}

function drawReferenceOverlay(ctx, candidate, match) {
  const strokes = normalizedTemplateStrokes(match?.entry?.strokeTemplate);
  if (!candidate || !strokes.length) {
    return;
  }

  const rotationDeg = match.templateMatch?.rotationDeg ?? 0;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(255, 247, 219, 0.92)";
  ctx.shadowColor = "rgba(36, 27, 22, 0.42)";
  ctx.shadowBlur = 6;

  for (const stroke of strokes) {
    if (!stroke.length) {
      continue;
    }
    ctx.beginPath();
    const first = templatePointToCanvas(stroke[0], candidate, rotationDeg);
    ctx.moveTo(first.x, first.y);
    for (let index = 1; index < stroke.length; index += 1) {
      const point = templatePointToCanvas(stroke[index], candidate, rotationDeg);
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  ctx.lineWidth = 2.25;
  ctx.strokeStyle = "rgba(31, 111, 115, 0.95)";

  for (const stroke of strokes) {
    if (!stroke.length) {
      continue;
    }
    ctx.beginPath();
    const first = templatePointToCanvas(stroke[0], candidate, rotationDeg);
    ctx.moveTo(first.x, first.y);
    for (let index = 1; index < stroke.length; index += 1) {
      const point = templatePointToCanvas(stroke[index], candidate, rotationDeg);
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
  }

  ctx.restore();
}

function drawTraceReferenceOverlay(ctx, entry) {
  const strokes = normalizedTemplateStrokes(entry?.strokeTemplate);
  if (!strokes.length) {
    return;
  }

  const center = {
    x: elements.canvas.width / 2,
    y: elements.canvas.height / 2
  };
  const scale = Math.min(elements.canvas.width, elements.canvas.height) * 0.52;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(255, 247, 219, 0.72)";
  ctx.shadowColor = "rgba(36, 27, 22, 0.2)";
  ctx.shadowBlur = 8;

  for (const stroke of strokes) {
    if (!stroke.length) {
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(center.x + (stroke[0].x - 0.5) * scale, center.y + (stroke[0].y - 0.5) * scale);
    for (let index = 1; index < stroke.length; index += 1) {
      ctx.lineTo(center.x + (stroke[index].x - 0.5) * scale, center.y + (stroke[index].y - 0.5) * scale);
    }
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(184, 69, 49, 0.6)";
  ctx.setLineDash([10, 8]);

  for (const stroke of strokes) {
    if (!stroke.length) {
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(center.x + (stroke[0].x - 0.5) * scale, center.y + (stroke[0].y - 0.5) * scale);
    for (let index = 1; index < stroke.length; index += 1) {
      ctx.lineTo(center.x + (stroke[index].x - 0.5) * scale, center.y + (stroke[index].y - 0.5) * scale);
    }
    ctx.stroke();
  }

  ctx.restore();
}

function buildStandaloneCandidate(strokes) {
  if (!strokes.length) {
    return null;
  }

  const points = allPoints(strokes);
  if (!points.length) {
    return null;
  }

  const bounds = boundsForStrokes(strokes);
  const center = centerOfBounds(bounds);
  const canvasCenter = {
    x: elements.canvas.width / 2,
    y: elements.canvas.height / 2
  };
  const syntheticRingRadius = Math.min(elements.canvas.width, elements.canvas.height) * 0.42;
  const length = strokes.reduce((sum, stroke) => sum + strokeLength(stroke), 0);
  const size = Math.max(bounds.width, bounds.height);
  const orientationDeg = dominantAxisOrientationDeg(points);
  const directedOrientationDeg = directedStrokeAngle(strokes);
  const angleDeg = angleDegFromCenter(center, canvasCenter);
  const compactPerimeter = Math.max(1, (bounds.width + bounds.height) * 2);
  const overdrawAmount = clamp(length / compactPerimeter - 0.72, 0, 1);

  return {
    candidateId: "lab-candidate",
    strokeIds: strokes.map((stroke) => stroke.id),
    rawStrokeCount: strokes.length,
    cleanedStrokeCount: strokes.length,
    bounds,
    center,
    radiusNorm: 0.5,
    angleDeg,
    layer: "any",
    nearBoundary: false,
    sizeNorm: size / Math.max(1, syntheticRingRadius * 2),
    lengthNorm: length / Math.max(1, Math.PI * 2 * syntheticRingRadius),
    orientationDeg,
    directedOrientationDeg,
    radialFacing: classifyRadialFacing(directedOrientationDeg, angleDeg),
    closedness: endpointClosedness(strokes, Math.max(1, size)),
    overdrawAmount,
    neatness: clamp(0.92 - overdrawAmount * 0.28 - Math.max(0, strokes.length - 4) * 0.035),
    strokes
  };
}

function scopedEntries() {
  const scoped = activeDictionary();
  return [
    ...scoped.sigils.map((entry) => ({ kind: "sigil", entry })),
    ...scoped.signs.map((entry) => ({ kind: "sign", entry }))
  ];
}

function scoreEntries(candidate) {
  return scopedEntries()
    .filter(({ entry }) => entry.strokeTemplate?.strokes?.length)
    .map(({ kind, entry }) => {
      const templateMatch = scoreStrokeTemplate(candidate, entry.strokeTemplate, {
        rotationInvariant: entry.recognitionRotationInvariant ?? true,
        allowedRotationsDeg: entry.allowedRotationsDeg
      });
      return {
        kind,
        entry,
        templateMatch
      };
    })
    .sort((a, b) => b.templateMatch.confidence - a.templateMatch.confidence);
}

function renderStrokeTemplatePreview(entry) {
  const strokes = normalizedTemplateStrokes(entry.strokeTemplate);
  if (!strokes?.length) {
    return "";
  }

  const polylines = strokes
    .map((stroke) => {
      const points = stroke
        .map((point) => `${Math.round((8 + point.x * 84) * 10) / 10},${Math.round((8 + point.y * 84) * 10) / 10}`)
        .join(" ");
      return `<polyline points="${points}"></polyline>`;
    })
    .join("");

  return `
    <div class="reference-preview detector-match-preview" aria-hidden="true">
      <svg viewBox="0 0 100 100" role="img" focusable="false">
        ${polylines}
      </svg>
    </div>
  `;
}

function renderMatchList(matches) {
  if (!matches.length) {
    elements.matchList.innerHTML = `<p class="reference-note">Draw one sigil or sign.</p>`;
    return;
  }

  elements.matchList.innerHTML = matches
    .slice(0, 8)
    .map(({ kind, entry, templateMatch }, index) => {
      const confidence = templateMatch.confidence;
      return `
        <article class="reference-card detector-match-card ${index === 0 ? "best" : ""}">
          ${renderStrokeTemplatePreview(entry)}
          <div class="detector-match-body">
            <div class="reference-card-header">
              <strong>${escapeHtml(entry.displayName ?? entry.id)}</strong>
              <span>${escapeHtml(kind)}</span>
            </div>
            <div class="detector-score-bar"><span style="width: ${Math.round(confidence * 100)}%"></span></div>
            <dl>
              <div><dt>Template</dt><dd>${percent(confidence)}</dd></div>
              <div><dt>Ink</dt><dd>${percent(templateMatch.inkScore)}</dd></div>
              <div><dt>Explained</dt><dd>${percent(templateMatch.candidateExplainedRatio)}</dd></div>
              <div><dt>Covered</dt><dd>${percent(templateMatch.templateCoveredRatio)}</dd></div>
              <div><dt>Rotation</dt><dd>${Math.round(templateMatch.rotationDeg)} deg</dd></div>
            </dl>
          </div>
        </article>
      `;
    })
    .join("");
}

function analyze() {
  if (!dictionary) {
    return;
  }

  const currentStroke = capture?.getCurrentStroke();
  const rawStrokes = currentStroke ? [...store.getStrokes(), currentStroke] : store.getStrokes();
  const cleanedStrokes = cleanStrokes(rawStrokes, CONFIG);
  const candidate = buildStandaloneCandidate(cleanedStrokes);

  if (!candidate) {
    analysis = {
      rawStrokes,
      cleanedStrokes,
      candidate: null,
      recognition: null,
      matches: []
    };
    updateDecision(null, []);
    return;
  }

  const matches = scoreEntries(candidate);
  const recognition = recognizeCandidates([candidate], activeDictionary(), CONFIG)[0] ?? null;
  analysis = {
    rawStrokes,
    cleanedStrokes,
    candidate,
    recognition,
    matches
  };
  updateDecision(recognition, matches);
}

function updateDecision(recognition, matches) {
  const bestMatch = matches[0]?.templateMatch ?? null;
  const recognized = Boolean(recognition?.recognized);
  const status = recognition?.recognitionStatus ?? (matches.length ? "unknown" : "valid");

  setStatus(matches.length ? statusLabel(status) : "Ready", statusClass(status, recognized));
  elements.undoButton.disabled = store.count() === 0;
  elements.recognizedValue.textContent = String(recognized);
  elements.kindValue.textContent = recognition?.kind ?? "none";
  elements.idValue.textContent = recognition?.id ?? "none";
  elements.confidenceValue.textContent = percent(recognition?.confidence);
  elements.templateValue.textContent = percent(bestMatch?.confidence);
  elements.inkValue.textContent = percent(bestMatch?.inkScore);
  elements.explainedValue.textContent = percent(bestMatch?.candidateExplainedRatio);
  elements.rotationValue.textContent = `${Math.round(bestMatch?.rotationDeg ?? 0)} deg`;
  renderMatchList(matches);

  writeJson(elements.recognitionOutput, rounded(recognition ?? { recognized: false }));
  writeJson(
    elements.candidateOutput,
    rounded({
      candidate: analysis?.candidate
        ? {
            ...analysis.candidate,
            strokes: undefined
          }
        : null,
      topMatches: matches.slice(0, 8).map(({ kind, entry, templateMatch }) => ({
        kind,
        id: entry.id,
        displayName: entry.displayName,
        confidence: templateMatch.confidence,
        inkScore: templateMatch.inkScore,
        softDiceScore: templateMatch.softDiceScore,
        candidateExplainedRatio: templateMatch.candidateExplainedRatio,
        templateCoveredRatio: templateMatch.templateCoveredRatio,
        unexplainedInkRatio: templateMatch.unexplainedInkRatio,
        contaminationRisk: templateMatch.contaminationRisk,
        rotationDeg: templateMatch.rotationDeg
      }))
    })
  );
}

function render() {
  drawPaper(ctx, elements.canvas.width, elements.canvas.height);
  const showPaperOverlay = elements.paperOverlayToggle.checked;
  if (showPaperOverlay) {
    drawTraceReferenceOverlay(ctx, selectedReferenceEntry());
  }
  drawStrokes(ctx, store.getStrokes(), capture?.getCurrentStroke(), CONFIG);

  if (showPaperOverlay) {
    drawReferenceOverlay(ctx, analysis?.candidate, analysis?.matches?.[0]);
  }

  if (showPaperOverlay && analysis?.candidate?.bounds) {
    const { bounds } = analysis.candidate;
    ctx.save();
    ctx.strokeStyle = analysis.recognition?.recognized ? "rgba(31, 111, 115, 0.72)" : "rgba(184, 69, 49, 0.62)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(bounds.minX - 8, bounds.minY - 8, bounds.width + 16, bounds.height + 16);
    ctx.restore();
  }

  requestAnimationFrame(render);
}

function setupControls() {
  function syncOverlayControls() {
    elements.referenceOverlay.disabled = !elements.paperOverlayToggle.checked;
  }

  elements.undoButton.addEventListener("click", () => {
    store.undo();
    analyze();
  });
  elements.clearButton.addEventListener("click", () => {
    store.clear();
    analyze();
  });
  elements.dictionaryMode.addEventListener("change", analyze);
  elements.referenceOverlay.addEventListener("change", () => {
    analyze();
  });
  elements.paperOverlayToggle.addEventListener("change", syncOverlayControls);
  syncOverlayControls();
}

async function init() {
  setupControls();
  capture = new DrawingCapture(elements.canvas, store, CONFIG, {
    onPreview: analyze,
    onCommit: analyze
  });

  try {
    dictionary = await loadDictionary();
    populateReferenceOverlay();
    capture.enable();
    analyze();
    setStatus("Ready");
    requestAnimationFrame(render);
  } catch (error) {
    console.error(error);
    setStatus("Dictionary load failed", "invalid");
  }
}

init();
