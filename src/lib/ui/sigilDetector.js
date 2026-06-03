/**
 * Pure analysis logic for the Sigil/Sign Detector Lab. Mirrors the parser's
 * candidate-building and scoring path for a single free-floating symbol so the
 * lab can score a drawing against the dictionary without an enclosing ring.
 * Canvas dimensions are passed in; no DOM access lives here.
 */
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
} from "../utils/geometry.js";
import { cleanStrokes } from "../parser/strokeCleaner.js";
import { recognizeCandidates } from "../parser/symbolRecognizer.js";
import { scoreStrokeTemplate } from "../parser/templateMatcher.js";
import { normalizeStrokesForTemplate } from "../parser/templateNormalizer.js";

const normalizedStrokeTemplateCache = new WeakMap();

export function percent(value) {
  return `${Math.round((value ?? 0) * 100)}%`;
}

export function statusLabel(status) {
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

export function statusClass(status, recognized) {
  if (status === "contaminated" || status === "unknown") {
    return "invalid";
  }
  if (status === "valid_messy" || status === "ambiguous") {
    return "prepared";
  }
  return recognized ? "active" : "";
}

/** Narrows the dictionary to the entries the chosen mode should score against. */
export function activeDictionary(dictionary, mode) {
  if (!dictionary) {
    return { sigils: [], signs: [] };
  }
  return {
    sigils: mode === "signs" ? [] : dictionary.sigils,
    signs: mode === "sigils" ? [] : dictionary.signs
  };
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

/**
 * Builds a synthetic recognition candidate for a single drawing, faking the
 * ring-relative geometry the recognizer normally derives from a full seal.
 */
export function buildStandaloneCandidate(strokes, canvasWidth, canvasHeight) {
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
    x: canvasWidth / 2,
    y: canvasHeight / 2
  };
  const syntheticRingRadius = Math.min(canvasWidth, canvasHeight) * 0.42;
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

function scopedEntries(dictionary, mode) {
  const scoped = activeDictionary(dictionary, mode);
  return [
    ...scoped.sigils.map((entry) => ({ kind: "sigil", entry })),
    ...scoped.signs.map((entry) => ({ kind: "sign", entry }))
  ];
}

/** Scores a candidate against every templated dictionary entry in scope. */
export function scoreEntries(candidate, dictionary, mode) {
  return scopedEntries(dictionary, mode)
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

/** Normalized + cached template strokes for overlay/preview rendering. */
export function normalizedTemplateStrokes(strokeTemplate) {
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

export function rotateTemplatePoint(point, degrees) {
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

/**
 * Runs the full single-symbol analysis: cleans strokes, builds the candidate,
 * scores the dictionary, and runs recognition. Returns plain data.
 */
export function analyzeStrokes({ strokes, dictionary, mode, canvasWidth, canvasHeight, config }) {
  const cleanedStrokes = cleanStrokes(strokes, config);
  const candidate = buildStandaloneCandidate(cleanedStrokes, canvasWidth, canvasHeight);

  if (!candidate) {
    return { cleanedStrokes, candidate: null, recognition: null, matches: [] };
  }

  const matches = scoreEntries(candidate, dictionary, mode);
  const recognition = recognizeCandidates([candidate], activeDictionary(dictionary, mode), config)[0] ?? null;
  return { cleanedStrokes, candidate, recognition, matches };
}
