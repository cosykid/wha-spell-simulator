import { angleDegFromCenter, distance } from "../utils/geometry.js";
import { mapRadiusToLayer } from "./layerMapper.js";

// Convert canvas coordinates into ring-relative measurements. radiusNorm is
// the point's distance as a fraction of the detected ring radius, and centeredY
// is flipped so positive values behave like an upward math axis.
function normalizePoint(point, ring) {
  const radiusNorm = distance(point, ring.center) / Math.max(1, ring.radius);
  return {
    ...point,
    radiusNorm,
    angleDeg: angleDegFromCenter(point, ring.center),
    centeredX: point.x - ring.center.x,
    centeredY: ring.center.y - point.y
  };
}

// Classify each stroke by where its points sit relative to the detected ring (outside, inside, etc.).
// Ring strokes are reserved as boundary ink, inside strokes can become symbols,
// and mostly outside or crossing strokes are kept out of symbol grouping.
export function classifyStrokesAgainstRing(strokes, ring, config) {
  if (!ring.found) {
    return strokes.map((stroke) => ({
      strokeId: stroke.id,
      classification: "unbounded",
      insideRatio: 0,
      outsideRatio: 0,
      boundaryRatio: 0,
      usedByParser: false,
      canJoinSymbol: false
    }));
  }

  const ringStrokeIds = new Set(ring.strokeIds);

  return strokes.map((stroke) => {
    if (ringStrokeIds.has(stroke.id)) {
      return {
        strokeId: stroke.id,
        classification: "ring",
        insideRatio: 0,
        outsideRatio: 0,
        boundaryRatio: 1,
        usedByParser: false,
        canJoinSymbol: false
      };
    }

    const normalized = stroke.points.map((point) => normalizePoint(point, ring));
    const insideRatio =
      normalized.filter((point) => point.radiusNorm < config.layers.outerMax).length / Math.max(1, normalized.length);
    const boundaryRatio =
      normalized.filter(
        (point) =>
          point.radiusNorm >= config.layers.outerMax - config.layers.boundaryTolerance &&
          point.radiusNorm <= config.layers.boundaryMax
      ).length / Math.max(1, normalized.length);
    const outsideRatio =
      normalized.filter((point) => point.radiusNorm > config.layers.boundaryMax).length / Math.max(1, normalized.length);

    // These ratios deliberately leave a little tolerance around the outer layer
    // so near-boundary sign strokes can still join symbols when they are mostly
    // on the paper instead of being treated as stray outside ink.
    let classification = "inside";
    if (outsideRatio > 0.62) {
      classification = "outside";
    } else if (insideRatio > 0.12 && outsideRatio > 0.18) {
      classification = "boundary-crossing";
    } else if (boundaryRatio > 0.55 && insideRatio < 0.45) {
      classification = "boundary-near";
    }
    const usedByParser = classification === "inside" && insideRatio >= 0.45;

    return {
      strokeId: stroke.id,
      classification,
      insideRatio,
      outsideRatio,
      boundaryRatio,
      usedByParser,
      canJoinSymbol:
        usedByParser || (classification === "boundary-near" && outsideRatio <= 0.08)
    };
  });
}

export function summarizePolar(point, ring, config) {
  const normalized = normalizePoint(point, ring);
  const layer = mapRadiusToLayer(normalized.radiusNorm, config);
  return {
    radiusNorm: normalized.radiusNorm,
    angleDeg: normalized.angleDeg,
    ...layer
  };
}
