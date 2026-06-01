import { clamp, degreesToRadians, normalizeAngleDeg } from "../utils/geometry.js";
import { normalizeStrokesForTemplate } from "./templateNormalizer.js";

const INK_SIZE = 40;
const CORE_RADIUS = 1;
const SOFT_RADIUS = 2;
const LOOSE_RADIUS = 4;
const CANDIDATE_SAMPLES_PER_STROKE = 40;
const REGION_GRID_SIZE = 10;
const ROTATION_STABILITY_MARGIN = 0.018;
const templateInkCache = new WeakMap();
const candidateInkCache = new WeakMap();

function rotationSet(options) {
  if (Array.isArray(options.allowedRotationsDeg) && options.allowedRotationsDeg.length) {
    return options.allowedRotationsDeg;
  }
  if (options.rotationInvariant) {
    return [0, 45, 90, 135, 180, 225, 270, 315];
  }
  return [0];
}

function rotationTransform(degrees) {
  if (!degrees) {
    return null;
  }

  const radians = degreesToRadians(degrees);
  return {
    cos: Math.cos(radians),
    sin: Math.sin(radians)
  };
}

function normalizedRotationMagnitude(degrees) {
  const normalized = normalizeAngleDeg(degrees);
  return Math.min(normalized, 360 - normalized) / 180;
}

function rotatePoint(point, transform) {
  if (!transform) {
    return point;
  }

  const x = point.x - 0.5;
  const y = point.y - 0.5;
  return {
    x: x * transform.cos - y * transform.sin + 0.5,
    y: x * transform.sin + y * transform.cos + 0.5
  };
}

function createLayer(size) {
  return {
    mask: new Uint8Array(size * size),
    ink: 0
  };
}

function markMask(mask, size, x, y, radius) {
  const centerX = Math.round(clamp(x, 0, 1) * (size - 1));
  const centerY = Math.round(clamp(y, 0, 1) * (size - 1));
  const radiusSq = radius * radius;

  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      if (offsetX * offsetX + offsetY * offsetY > radiusSq) {
        continue;
      }

      const pixelX = centerX + offsetX;
      const pixelY = centerY + offsetY;
      if (pixelX < 0 || pixelX >= size || pixelY < 0 || pixelY >= size) {
        continue;
      }

      mask[pixelY * size + pixelX] = 1;
    }
  }
}

function markInk(ink, size, x, y) {
  markMask(ink.core.mask, size, x, y, CORE_RADIUS);
  markMask(ink.soft.mask, size, x, y, SOFT_RADIUS);
  markMask(ink.loose.mask, size, x, y, LOOSE_RADIUS);
}

function drawSegment(ink, size, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) * size * 2));

  for (let index = 0; index <= steps; index += 1) {
    const local = index / steps;
    markInk(ink, size, start.x + dx * local, start.y + dy * local);
  }
}

function countInk(mask) {
  let ink = 0;
  for (const pixel of mask) {
    ink += pixel;
  }
  return ink;
}

function renderInk(strokes, rotationDeg = 0, size = INK_SIZE) {
  const ink = {
    core: createLayer(size),
    soft: createLayer(size),
    loose: createLayer(size)
  };
  const transform = rotationTransform(rotationDeg);

  for (const stroke of strokes ?? []) {
    if (!stroke?.length) {
      continue;
    }

    const points = stroke.map((point) => rotatePoint(point, transform));
    if (points.length === 1) {
      markInk(ink, size, points[0].x, points[0].y);
      continue;
    }

    for (let index = 1; index < points.length; index += 1) {
      drawSegment(ink, size, points[index - 1], points[index]);
    }
  }

  ink.core.ink = countInk(ink.core.mask);
  ink.soft.ink = countInk(ink.soft.mask);
  ink.loose.ink = countInk(ink.loose.mask);
  return ink;
}

function templateInk(strokeTemplate) {
  const cached = templateInkCache.get(strokeTemplate);
  if (cached) {
    return cached;
  }

  const normalized = normalizeStrokesForTemplate(strokeTemplate.strokes ?? [], {
    samplesPerStroke: CANDIDATE_SAMPLES_PER_STROKE,
    fitToBounds: true,
    digits: 5
  });
  const ink = renderInk(normalized.strokes ?? [], 0);
  templateInkCache.set(strokeTemplate, ink);
  return ink;
}

function candidateInk(candidate, rotationDeg) {
  let cached = candidateInkCache.get(candidate);
  if (!cached) {
    cached = {
      normalized: normalizeStrokesForTemplate(candidate.strokes, {
        samplesPerStroke: CANDIDATE_SAMPLES_PER_STROKE,
        fitToBounds: true,
        digits: 5
      }),
      rotations: new Map()
    };
    candidateInkCache.set(candidate, cached);
  }

  const cachedInk = cached.rotations.get(rotationDeg);
  if (cachedInk) {
    return cachedInk;
  }

  const ink = renderInk(cached.normalized.strokes, rotationDeg);
  cached.rotations.set(rotationDeg, ink);
  return ink;
}

function maskOverlap(a, b) {
  let overlap = 0;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] && b[index]) {
      overlap += 1;
    }
  }
  return overlap;
}

function diceScore(a, b, aInk, bInk) {
  if (!aInk || !bInk) {
    return 0;
  }
  return clamp((maskOverlap(a, b) * 2) / (aInk + bInk));
}

function occupiedCells(mask, size = INK_SIZE, gridSize = REGION_GRID_SIZE) {
  const cells = new Uint8Array(gridSize * gridSize);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!mask[y * size + x]) {
        continue;
      }
      const cellX = Math.min(gridSize - 1, Math.floor((x / size) * gridSize));
      const cellY = Math.min(gridSize - 1, Math.floor((y / size) * gridSize));
      cells[cellY * gridSize + cellX] = 1;
    }
  }

  return cells;
}

function cellStats(candidateInk, referenceInk) {
  const candidateCoreCells = occupiedCells(candidateInk.core.mask);
  const candidateLooseCells = occupiedCells(candidateInk.loose.mask);
  const referenceCoreCells = occupiedCells(referenceInk.core.mask);
  const referenceLooseCells = occupiedCells(referenceInk.loose.mask);

  let requiredCount = 0;
  let requiredCovered = 0;
  let candidateCount = 0;
  let forbiddenCandidateCount = 0;

  for (let index = 0; index < referenceCoreCells.length; index += 1) {
    if (referenceCoreCells[index]) {
      requiredCount += 1;
      if (candidateLooseCells[index]) {
        requiredCovered += 1;
      }
    }
    if (candidateCoreCells[index]) {
      candidateCount += 1;
      if (!referenceLooseCells[index]) {
        forbiddenCandidateCount += 1;
      }
    }
  }

  const requiredCellCoverage = requiredCount ? requiredCovered / requiredCount : 0;
  const forbiddenCellInkRatio = candidateCount ? forbiddenCandidateCount / candidateCount : 1;
  const regionScore = clamp(requiredCellCoverage * 0.68 + (1 - forbiddenCellInkRatio) * 0.32);

  return {
    requiredCellCoverage,
    forbiddenCellInkRatio,
    regionScore
  };
}

function compareInk(candidateInk, referenceInk) {
  const candidateInkCount = candidateInk.core.ink;
  const referenceInkCount = referenceInk.core.ink;

  if (!candidateInkCount || !referenceInkCount) {
    return {
      inkScore: 0,
      candidateExplainedRatio: 0,
      templateCoveredRatio: 0,
      softDiceScore: 0,
      unexplainedInkRatio: 1,
      missingInkRatio: 1,
      contaminationRisk: 1,
      requiredCellCoverage: 0,
      forbiddenCellInkRatio: 1,
      regionScore: 0
    };
  }

  const candidateExplainedRatio = clamp(
    maskOverlap(candidateInk.core.mask, referenceInk.loose.mask) / candidateInkCount
  );
  const templateCoveredRatio = clamp(
    maskOverlap(referenceInk.core.mask, candidateInk.loose.mask) / referenceInkCount
  );
  const softDiceScore = diceScore(
    candidateInk.soft.mask,
    referenceInk.soft.mask,
    candidateInk.soft.ink,
    referenceInk.soft.ink
  );
  const unexplainedInkRatio = clamp(1 - candidateExplainedRatio);
  const missingInkRatio = clamp(1 - templateCoveredRatio);
  const regions = cellStats(candidateInk, referenceInk);
  const inkScore = clamp(
    candidateExplainedRatio * 0.32 +
      templateCoveredRatio * 0.32 +
      softDiceScore * 0.14 +
      regions.requiredCellCoverage * 0.16 +
      (1 - regions.forbiddenCellInkRatio) * 0.06
  );
  const contaminationRisk = clamp(
    clamp((unexplainedInkRatio - 0.26) / 0.34) * 0.58 +
      clamp((missingInkRatio - 0.46) / 0.34) * 0.22 +
      clamp((regions.forbiddenCellInkRatio - 0.18) / 0.46) * 0.2
  );

  return {
    inkScore,
    candidateExplainedRatio,
    templateCoveredRatio,
    softDiceScore,
    unexplainedInkRatio,
    missingInkRatio,
    contaminationRisk,
    ...regions
  };
}

export function scoreStrokeTemplate(candidate, strokeTemplate, options = {}) {
  if (!strokeTemplate?.strokes?.length) {
    return {
      available: false,
      confidence: 0,
      rotationDeg: 0
    };
  }

  const referenceInk = templateInk(strokeTemplate);

  let best = {
    rotationDeg: 0,
    rankingScore: -1,
    inkScore: 0,
    candidateExplainedRatio: 0,
    templateCoveredRatio: 0,
    softDiceScore: 0,
    unexplainedInkRatio: 1,
    missingInkRatio: 1,
    contaminationRisk: 1,
    requiredCellCoverage: 0,
    forbiddenCellInkRatio: 1,
    regionScore: 0
  };

  for (const rotationDeg of rotationSet(options)) {
    const inkMatch = compareInk(candidateInk(candidate, rotationDeg), referenceInk);
    const rotationPenalty = normalizedRotationMagnitude(rotationDeg) * ROTATION_STABILITY_MARGIN;
    const rankingScore = inkMatch.inkScore - rotationPenalty;
    if (rankingScore > best.rankingScore) {
      best = {
        rotationDeg,
        rankingScore,
        ...inkMatch
      };
    }
  }

  const contaminationCap =
    best.unexplainedInkRatio > 0.36 && best.templateCoveredRatio < 0.82
      ? clamp(0.62 - (best.unexplainedInkRatio - 0.36) * 0.8, 0.2, 1)
      : 1;

  return {
    available: true,
    confidence: Math.min(clamp(best.rankingScore), contaminationCap),
    rotationDeg: best.rotationDeg,
    recognitionRotationDeg: best.rotationDeg,
    inkScore: best.inkScore,
    softDiceScore: best.softDiceScore,
    candidateExplainedRatio: best.candidateExplainedRatio,
    templateCoveredRatio: best.templateCoveredRatio,
    unexplainedInkRatio: best.unexplainedInkRatio,
    missingInkRatio: best.missingInkRatio,
    contaminationRisk: best.contaminationRisk,
    requiredCellCoverage: best.requiredCellCoverage,
    forbiddenCellInkRatio: best.forbiddenCellInkRatio,
    regionScore: best.regionScore
  };
}
