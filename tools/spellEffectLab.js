import { CONFIG } from "../src/lib/config.js";
import { directionFromTiltAngles } from "../src/lib/compiler/spellDirection.js";
import { writeJson } from "../src/lib/debug/debugOverlay.js";
import { drawGlowingStrokes } from "../src/lib/renderer/glyphOverlayRenderer.js";
import { drawGuides, drawPaper } from "../src/lib/renderer/paperRenderer.js";
import { SpellEffectRenderer } from "../src/lib/renderer/spellEffectRenderer.js";
import {
  activePortalPlane,
  convergenceFlow,
  resetParticleState
} from "../src/lib/renderer/effects/effectUtils.js";

const elements = {
  glyphCanvas: document.querySelector("#labGlyphCanvas"),
  effectCanvas: document.querySelector("#labEffectCanvas"),
  canvasShell: document.querySelector(".effect-lab-canvas-shell"),
  statusPill: document.querySelector("#statusPill"),
  elementControl: document.querySelector("#elementControl"),
  resetButton: document.querySelector("#resetButton"),
  sliderControls: document.querySelector("#sliderControls"),
  irInput: document.querySelector("#irInput"),
  applyIrButton: document.querySelector("#applyIrButton"),
  copyIrButton: document.querySelector("#copyIrButton"),
  irOutput: document.querySelector("#irOutput")
};

const glyphCtx = elements.glyphCanvas.getContext("2d");
const effectCtx = elements.effectCanvas.getContext("2d");
const effectRenderer = new SpellEffectRenderer(elements.effectCanvas, CONFIG);
let activatedAt = performance.now();

const controls = {
  effectScale: {
    label: "Sigil Size",
    value: 1.6,
    min: 1,
    max: 2.35,
    step: 0.01,
    description: "Scales the portal and particle body from the primary sigil size."
  },
  force: {
    label: "Force",
    value: 0.62,
    min: 0,
    max: 1,
    step: 0.01,
    description: "Raises speed, pressure, flame size, and overall push."
  },
  spread: {
    label: "Spread",
    value: 0.48,
    min: 0,
    max: 1,
    step: 0.01,
    description: "Widens the emission area and loosens particle paths."
  },
  focus: {
    label: "Focus",
    value: 0.65,
    min: 0,
    max: 1,
    step: 0.01,
    description: "Tightens the emission area and makes particles drift less."
  },
  gravity: {
    label: "Gravity",
    value: 1,
    min: 0,
    max: 1,
    step: 0.01,
    description: "Controls falling versus suspended motion. Lower values act like levitation."
  },
  convergenceStrength: {
    label: "Convergence",
    value: 0,
    min: 0,
    max: 1,
    step: 0.01,
    description: "Compresses the spread into a narrow centerline as the effect travels."
  },
  convergenceRadius: {
    label: "Compression Radius",
    value: 0.08,
    min: 0.03,
    max: 0.35,
    step: 0.01,
    description: "Sets how narrow the final compressed stream becomes."
  },
  convergenceRigidity: {
    label: "Rigidity",
    value: 0.9,
    min: 0,
    max: 1,
    step: 0.01,
    description: "Controls how strongly particles stay near the compressed path."
  },
  convergenceX: {
    label: "Centerline X",
    value: 0,
    min: -1,
    max: 1,
    step: 0.01,
    description: "Offsets the compressed path sideways from the ring center."
  },
  convergenceY: {
    label: "Centerline Y",
    value: 0,
    min: -1,
    max: 1,
    step: 0.01,
    description: "Offsets the compressed path forward or backward along the effect direction."
  },
  duration: {
    label: "Duration",
    value: 5,
    min: 0.5,
    max: 8.5,
    step: 0.1,
    description: "Sets how long the active spell effect remains alive."
  },
  stability: {
    label: "Stability",
    value: 0.72,
    min: 0,
    max: 1,
    step: 0.01,
    description: "Reduces jitter, flicker, and unstable particle drift."
  },
  xTiltDeg: {
    label: "Tilt Toward X",
    value: 0,
    min: -82,
    max: 82,
    step: 1,
    description: "Leans the effect direction toward the left or right side."
  },
  yTiltDeg: {
    label: "Tilt Toward Y",
    value: -42,
    min: -82,
    max: 82,
    step: 1,
    description: "Leans the effect direction toward the top or bottom side."
  },
  ringRadius: {
    label: "Ring Size",
    value: 0.34,
    min: 0.2,
    max: 0.46,
    step: 0.01,
    description: "Changes the drawn test ring and the portal size."
  }
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

function setStatus(text, className = "") {
  elements.statusPill.textContent = text;
  elements.statusPill.className = `status-pill ${className}`.trim();
}

function numericControl(key) {
  return controls[key].value;
}

function buildManifestations(gravity) {
  const levitationStrength = clamp(1 - gravity, 0, 1);
  const convergenceStrength = numericControl("convergenceStrength");
  const manifestations = {};

  if (levitationStrength > 0) {
    manifestations.levitation = {
      strength: levitationStrength
    };
  }

  if (convergenceStrength > 0) {
    manifestations.convergence = {
      strength: convergenceStrength,
      point: {
        x: numericControl("convergenceX"),
        y: numericControl("convergenceY")
      },
      radius: numericControl("convergenceRadius"),
      rigidity: numericControl("convergenceRigidity")
    };
  }

  const primaryManifestation = Object.entries(manifestations).sort(
    ([, left], [, right]) => right.strength - left.strength
  )[0]?.[0];

  if (!primaryManifestation) {
    return {
      primaryManifestation: "aura",
      manifestations: {
        aura: {
          strength: 1
        }
      }
    };
  }

  return {
    primaryManifestation,
    manifestations
  };
}

function buildRing() {
  const width = elements.glyphCanvas.width;
  const height = elements.glyphCanvas.height;
  return {
    found: true,
    complete: true,
    center: {
      x: width / 2,
      y: height * 0.56
    },
    radius: Math.min(width, height) * numericControl("ringRadius"),
    strokeIds: ["lab-ring"]
  };
}

function buildRingStroke(ring) {
  const points = [];
  for (let index = 0; index <= 96; index += 1) {
    const angle = (index / 96) * Math.PI * 2;
    points.push({
      x: ring.center.x + Math.cos(angle) * ring.radius,
      y: ring.center.y + Math.sin(angle) * ring.radius
    });
  }
  return {
    id: "lab-ring",
    points
  };
}

function buildSigilStroke(ring) {
  const radius = ring.radius * (0.16 + numericControl("effectScale") * 0.035);
  const points = [];
  // pentagram example
  for (let index = 0; index < 6; index += 1) {
    const angle = (-Math.PI / 2) + index * ((Math.PI * 2) / 5);
    points.push({
      x: ring.center.x + Math.cos(angle) * radius,
      y: ring.center.y + Math.sin(angle) * radius
    });
  }
  return {
    id: "lab-sigil",
    points
  };
}

function buildSpellIR() {
  const element = elements.elementControl.value;
  const effectScale = numericControl("effectScale");
  const force = numericControl("force");
  const spread = numericControl("spread");
  const focus = numericControl("focus");
  const gravity = numericControl("gravity");
  const duration = numericControl("duration");
  const stability = numericControl("stability");
  const direction = directionFromTiltAngles(numericControl("xTiltDeg"), numericControl("yTiltDeg"));
  const { primaryManifestation, manifestations } = buildManifestations(gravity);

  return {
    type: "SpellIR",
    active: true,
    prepared: false,
    valid: true,
    status: "Active spell",
    activatedAt,
    element,
    elementConfidence: 1,
    primarySizeNorm: (effectScale - CONFIG.renderer.effectSize.baseScale) / CONFIG.renderer.effectSize.sigilSizeInfluence,
    effectScale,
    primaryManifestation,
    manifestations,
    direction,
    directionCoherence: clamp(Math.hypot(direction.x, direction.y), 0, 1),
    gravity,
    force,
    spread,
    focus,
    range: 0.55,
    duration,
    stability,
    quality: stability,
    neatness: stability,
    warnings: [],
    signature: [
      "lab",
      element,
      Math.round(effectScale * 100),
      Math.round(force * 100),
      Math.round(spread * 100),
      Math.round(focus * 100),
      Math.round(gravity * 100),
      Math.round(numericControl("convergenceStrength") * 100),
      Math.round(numericControl("convergenceRadius") * 100),
      Math.round(numericControl("convergenceRigidity") * 100),
      Math.round(numericControl("convergenceX") * 100),
      Math.round(numericControl("convergenceY") * 100),
      Math.round(duration * 10),
      Math.round(stability * 100),
      Math.round(numericControl("xTiltDeg")),
      Math.round(numericControl("yTiltDeg")),
      Math.round(numericControl("ringRadius") * 100)
    ].join(":")
  };
}

function renderSlider(key, control) {
  const label = document.createElement("label");
  label.className = "effect-lab-slider";
  label.innerHTML = `
    <span>${control.label}</span>
    <strong id="${key}Value">${control.value}</strong>
    <small>${control.description}</small>
    <input
      type="range"
      id="${key}Control"
      min="${control.min}"
      max="${control.max}"
      step="${control.step}"
      value="${control.value}"
    >
  `;
  elements.sliderControls.append(label);

  const input = label.querySelector("input");
  const value = label.querySelector("strong");
  input.addEventListener("input", () => {
    control.value = Number(input.value);
    value.textContent = formatControlValue(key, control.value);
    restartSpell();
    updateIrOutput();
  });
  value.textContent = formatControlValue(key, control.value);
}

function formatControlValue(key, value) {
  if (key === "xTiltDeg" || key === "yTiltDeg") {
    return `${Math.round(value)} deg`;
  }
  if (key === "duration") {
    return `${Math.round(value * 10) / 10}s`;
  }
  return String(Math.round(value * 100) / 100);
}

function setupSliders() {
  const title = document.createElement("h2");
  title.textContent = "SpellIR Controls";
  elements.sliderControls.append(title);

  for (const [key, control] of Object.entries(controls)) {
    renderSlider(key, control);
  }
}

function setControlValue(key, value) {
  const control = controls[key];
  if (!control || typeof value !== "number" || Number.isNaN(value)) {
    return;
  }

  control.value = clamp(value, control.min, control.max);
  const input = document.querySelector(`#${key}Control`);
  const output = document.querySelector(`#${key}Value`);
  if (input) {
    input.value = String(control.value);
  }
  if (output) {
    output.textContent = formatControlValue(key, control.value);
  }
}

function applySpellIR(spellIR) {
  if (!spellIR || typeof spellIR !== "object") {
    throw new Error("Paste a SpellIR JSON object.");
  }

  if (spellIR.element) {
    elements.elementControl.value = spellIR.element;
  }
  setControlValue("effectScale", Number(spellIR.effectScale));
  setControlValue("force", Number(spellIR.force));
  setControlValue("spread", Number(spellIR.spread));
  setControlValue("focus", Number(spellIR.focus ?? clamp(1 - Number(spellIR.spread) * 0.72, 0, 1)));
  setControlValue("gravity", Number(spellIR.gravity));
  setControlValue("convergenceStrength", Number(spellIR.manifestations?.convergence?.strength ?? 0));
  setControlValue("convergenceRadius", Number(spellIR.manifestations?.convergence?.radius ?? controls.convergenceRadius.value));
  setControlValue("convergenceRigidity", Number(spellIR.manifestations?.convergence?.rigidity ?? controls.convergenceRigidity.value));
  setControlValue("convergenceX", Number(spellIR.manifestations?.convergence?.point?.x ?? controls.convergenceX.value));
  setControlValue("convergenceY", Number(spellIR.manifestations?.convergence?.point?.y ?? controls.convergenceY.value));
  setControlValue("duration", Number(spellIR.duration));
  setControlValue("stability", Number(spellIR.stability));

  if (spellIR.direction) {
    if (typeof spellIR.direction.xTiltDeg === "number" || typeof spellIR.direction.yTiltDeg === "number") {
      setControlValue("xTiltDeg", Number(spellIR.direction.xTiltDeg ?? 0));
      setControlValue("yTiltDeg", Number(spellIR.direction.yTiltDeg ?? 0));
    } else {
      setControlValue("xTiltDeg", Math.atan2(spellIR.direction.x ?? 0, spellIR.direction.z ?? 1) * (180 / Math.PI));
      setControlValue("yTiltDeg", Math.atan2(spellIR.direction.y ?? 0, spellIR.direction.z ?? 1) * (180 / Math.PI));
    }
  }

  restartSpell();
  updateIrOutput();
}

function resetParticles() {
  effectRenderer.lastSignature = null;
  effectRenderer.lastTime = null;
  resetParticleState(effectRenderer.state);
}

function restartSpell() {
  activatedAt = performance.now();
  resetParticles();
}

function updateIrOutput() {
  writeJson(elements.irOutput, rounded(buildSpellIR()));
}

function drawSyntheticGlyph(ring, timestamp) {
  const width = elements.glyphCanvas.width;
  const height = elements.glyphCanvas.height;
  const ringStroke = buildRingStroke(ring);
  const sigilStroke = buildSigilStroke(ring);

  drawPaper(glyphCtx, width, height);
  drawGuides(glyphCtx, ring, width, height, CONFIG);

  glyphCtx.save();
  glyphCtx.lineCap = "round";
  glyphCtx.lineJoin = "round";
  glyphCtx.strokeStyle = CONFIG.renderer.inkColor;
  glyphCtx.lineWidth = 4.4;
  glyphCtx.beginPath();
  glyphCtx.moveTo(ringStroke.points[0].x, ringStroke.points[0].y);
  for (const point of ringStroke.points.slice(1)) {
    glyphCtx.lineTo(point.x, point.y);
  }
  glyphCtx.stroke();

  glyphCtx.beginPath();
  glyphCtx.moveTo(sigilStroke.points[0].x, sigilStroke.points[0].y);
  for (const point of sigilStroke.points.slice(1)) {
    glyphCtx.lineTo(point.x, point.y);
  }
  glyphCtx.stroke();
  glyphCtx.restore();

  drawGlowingStrokes(
    glyphCtx,
    activatedAt,
    new Set(["lab-ring", "lab-sigil"]),
    [ringStroke, sigilStroke],
    numericControl("duration") * 1000,
    timestamp
  );
}

function drawConvergencePathGuide(spellIR, ring) {
  const convergence = spellIR.manifestations?.convergence;
  if (!convergence?.strength) {
    return;
  }

  const portal = activePortalPlane(elements.effectCanvas, ring);
  const flow = convergenceFlow(spellIR, portal, 0);
  const guideLength = ring.radius * (0.72 + spellIR.force * 0.46 + spellIR.range * 0.22);
  const end = {
    x: flow.origin.x + flow.direction.x * guideLength,
    y: flow.origin.y + flow.direction.y * guideLength
  };
  const radiusX = Math.max(5, flow.radiusX);
  const radiusY = Math.max(4, flow.radiusY);

  effectCtx.save();
  effectCtx.globalCompositeOperation = "source-over";
  effectCtx.strokeStyle = "rgba(19, 118, 166, 0.78)";
  effectCtx.lineWidth = 1.4;
  effectCtx.setLineDash([4, 5]);
  effectCtx.beginPath();
  effectCtx.moveTo(flow.origin.x, flow.origin.y);
  effectCtx.lineTo(end.x, end.y);
  effectCtx.stroke();
  effectCtx.beginPath();
  effectCtx.ellipse(end.x, end.y, radiusX, radiusY, 0, 0, Math.PI * 2);
  effectCtx.stroke();
  effectCtx.setLineDash([]);
  effectCtx.beginPath();
  effectCtx.moveTo(end.x - 7, end.y);
  effectCtx.lineTo(end.x + 7, end.y);
  effectCtx.moveTo(end.x, end.y - 7);
  effectCtx.lineTo(end.x, end.y + 7);
  effectCtx.stroke();
  effectCtx.restore();
}

function resizeCanvases() {
  const rect = elements.canvasShell.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  if (elements.glyphCanvas.width === width && elements.glyphCanvas.height === height) {
    return;
  }

  elements.glyphCanvas.width = width;
  elements.glyphCanvas.height = height;
  elements.effectCanvas.width = width;
  elements.effectCanvas.height = height;
  resetParticles();
}

function animationFrame(timestamp) {
  resizeCanvases();
  const ring = buildRing();
  const spellIR = buildSpellIR();
  drawSyntheticGlyph(ring, timestamp);
  effectRenderer.render(spellIR, ring, timestamp, { showGuides: false });
  drawConvergencePathGuide(spellIR, ring);
  requestAnimationFrame(animationFrame);
}

function setupControls() {
  setupSliders();
  elements.elementControl.addEventListener("change", () => {
    restartSpell();
    updateIrOutput();
  });
  elements.resetButton.addEventListener("click", () => {
    restartSpell();
    setStatus("Particles reset", "prepared");
  });
  elements.applyIrButton.addEventListener("click", () => {
    try {
      applySpellIR(JSON.parse(elements.irInput.value));
      setStatus("IR applied", "active");
    } catch (error) {
      setStatus(error.message, "invalid");
    }
  });
  elements.copyIrButton.addEventListener("click", async () => {
    const json = JSON.stringify(rounded(buildSpellIR()), null, 2);
    elements.irInput.value = json;
    try {
      await navigator.clipboard?.writeText(json);
      setStatus("IR copied", "active");
    } catch {
      setStatus("IR copied to input", "prepared");
    }
  });
}

setupControls();
updateIrOutput();
requestAnimationFrame(animationFrame);
