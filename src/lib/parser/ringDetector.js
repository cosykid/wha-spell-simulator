import {
  allPoints,
  angleDegFromCenter,
  boundsForStrokes,
  centerOfBounds,
  clamp,
  degreesToRadians,
  distance,
  mean,
  stddev,
  strokeLength
} from "../utils/geometry.js";
import { analyzeTopologicalClosure } from "./topologicalFloodFill.js";

const MIN_CLOSURE_RELEVANT_POINT_RATIO = 0.15;
const RING_BIN_COUNT = 96;
const MIN_SEED_LENGTH_PX = 130;
const FOUND_COMPLETENESS = 0.52;
const ACTIVATION_COMPLETENESS_FLOOR = 0.64;
const MIN_ROUNDNESS = 0.36;
const OPEN_COVERAGE_HALF_WIDTH_PX = 12;
const OPEN_COVERAGE_HALF_WIDTH_RATIO = 0.055;
const OPEN_COLLECTION_MIN_RATIO = 0.45;
const STROKE_SAMPLE_STEP_PX = 0.75;
const TOPOLOGY_RING_STROKE_MIN_NEAR_CIRCLE_RATIO = 0.56;
const TOPOLOGY_RING_STROKE_MIN_NEAR_CIRCLE_LENGTH_PX = 24;
const TOPOLOGY_RING_PRUNE_COVERAGE_FLOOR = 0.88;
const TOPOLOGY_RING_PRUNE_MAX_ANGULAR_SPAN_DEG = 24;

// One physical ring can produce several candidates from different seed strokes or
// topology passes. These tolerances merge those duplicate candidates before we
// decide whether the drawing has unsupported multiple distinct rings.
const SAME_RING_CENTER_DISTANCE_RATIO = 0.22;
const SAME_RING_RADIUS_RATIO = 0.18;

// Solves the 3 unknowns from the circle fit's linearized equation:
// x^2 + y^2 = a*x + b*y + c. Uses Gaussian elimination on a 3x3 system.
function solve3(matrix, vector) {
  const a = matrix.map((row, index) => [...row, vector[index]]);

  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) {
        pivot = row;
      }
    }

    if (Math.abs(a[pivot][column]) < 1e-8) {
      return null;
    }

    [a[column], a[pivot]] = [a[pivot], a[column]];
    const divisor = a[column][column];
    for (let item = column; item < 4; item += 1) {
      a[column][item] /= divisor;
    }

    for (let row = 0; row < 3; row += 1) {
      if (row === column) {
        continue;
      }
      const factor = a[row][column];
      for (let item = column; item < 4; item += 1) {
        a[row][item] -= factor * a[column][item];
      }
    }
  }

  return [a[0][3], a[1][3], a[2][3]];
}

function fitCircle(points) {
  if (points.length < 8) {
    return null;
  }

  let sumX = 0;
  let sumY = 0;
  let sumX2 = 0;
  let sumY2 = 0;
  let sumXY = 0;
  let sumX3 = 0;
  let sumY3 = 0;
  let sumX2Y = 0;
  let sumXY2 = 0;

  for (const point of points) {
    const x = point.x;
    const y = point.y;
    const x2 = x * x;
    const y2 = y * y;
    sumX += x;
    sumY += y;
    sumX2 += x2;
    sumY2 += y2;
    sumXY += x * y;
    sumX3 += x2 * x;
    sumY3 += y2 * y;
    sumX2Y += x2 * y;
    sumXY2 += x * y2;
  }

  const result = solve3(
    [
      [sumX2, sumXY, sumX],
      [sumXY, sumY2, sumY],
      [sumX, sumY, points.length]
    ],
    [sumX3 + sumXY2, sumX2Y + sumY3, sumX2 + sumY2]
  );

  if (!result) {
    return null;
  }

  const [a, b, c] = result;
  const center = { x: a / 2, y: b / 2 };
  const radiusSquared = c + center.x * center.x + center.y * center.y;
  if (!Number.isFinite(radiusSquared) || radiusSquared <= 0) {
    return null;
  }

  return {
    center,
    radius: Math.sqrt(radiusSquared)
  };
}

function fallbackCircle(strokes) {
  const bounds = boundsForStrokes(strokes);
  return {
    center: centerOfBounds(bounds),
    radius: (bounds.width + bounds.height) / 4
  };
}

function markAngle(bins, angleDeg) {
  const bin = Math.floor((angleDeg / 360) * bins.length) % bins.length;
  bins[bin] = true;
}

function largestGap(bins) {
  const size = bins.length;
  let bestStart = 0;
  let bestLength = 0;
  let currentStart = 0;
  let currentLength = 0;

  for (let index = 0; index < size * 2; index += 1) {
    const bin = bins[index % size];
    if (!bin) {
      if (currentLength === 0) {
        currentStart = index;
      }
      currentLength += 1;
      if (currentLength > bestLength && currentLength <= size) {
        bestStart = currentStart;
        bestLength = currentLength;
      }
    } else {
      currentLength = 0;
    }
  }

  const binDegrees = 360 / size;
  return {
    startAngle: (bestStart % size) * binDegrees,
    endAngle: ((bestStart + bestLength) % size) * binDegrees,
    sizeDegrees: bestLength * binDegrees
  };
}

function openCoverageHalfWidth(radius, config) {
  return Math.max(OPEN_COVERAGE_HALF_WIDTH_PX, radius * OPEN_COVERAGE_HALF_WIDTH_RATIO);
}

function strokeCircleMetrics(stroke, circle, config, bins = null) {
  const halfWidth = openCoverageHalfWidth(circle.radius, config);
  const sampleStep = STROKE_SAMPLE_STEP_PX;
  let totalLength = 0;
  let nearLength = 0;

  for (let index = 1; index < stroke.points.length; index += 1) {
    const previous = stroke.points[index - 1];
    const current = stroke.points[index];
    const segmentLength = distance(previous, current);
    if (segmentLength <= 0) {
      continue;
    }

    const steps = Math.max(1, Math.ceil(segmentLength / sampleStep));
    const sampleLength = segmentLength / steps;
    totalLength += segmentLength;

    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      const point = {
        x: previous.x + (current.x - previous.x) * t,
        y: previous.y + (current.y - previous.y) * t
      };
      const nearCircle = Math.abs(distance(point, circle.center) - circle.radius) <= halfWidth;
      if (nearCircle) {
        nearLength += sampleLength;
        if (bins) {
          markAngle(bins, angleDegFromCenter(point, circle.center));
        }
      }
    }
  }

  return {
    totalLength,
    nearLength,
    nearRatio: totalLength > 0 ? nearLength / totalLength : 0
  };
}

function measureOpenCoverage(strokes, circle, config) {
  const bins = new Array(RING_BIN_COUNT).fill(false);
  let nearLength = 0;
  let totalLength = 0;

  for (const stroke of strokes) {
    const metrics = strokeCircleMetrics(stroke, circle, config, bins);
    nearLength += metrics.nearLength;
    totalLength += metrics.totalLength;
  }

  const coverageBins = bins.flatMap((covered, index) => (covered ? [index] : []));
  const coverageRatio = coverageBins.length / Math.max(1, bins.length);
  const gap = largestGap(bins);

  return {
    coverageRatio,
    gap,
    gapArcLength: degreesToRadians(gap.sizeDegrees) * circle.radius,
    nearCircleInkRatio: totalLength > 0 ? nearLength / totalLength : 0
  };
}

function measureRing(strokes, config, referenceRing = null, topology = null) {
  const points = allPoints(strokes);
  if (points.length < 8 && !topology?.closed) {
    return null;
  }

  const fitted = points.length >= 8 ? fitCircle(points) ?? fallbackCircle(strokes) : null;
  const center = referenceRing?.center ?? fitted?.center ?? topology?.center;
  const radius =
    referenceRing?.radius ?? fitted?.radius ?? topology?.radius ?? mean(points.map((point) => distance(point, center)));
  if (!center || !Number.isFinite(radius) || radius <= 0) {
    return null;
  }

  const radialDistances = points.map((point) => distance(point, center));
  const residual = topology?.closed ? topology.normalizedRmse : stddev(radialDistances) / Math.max(1, radius);
  const bounds = points.length ? boundsForStrokes(strokes) : { width: radius * 2, height: radius * 2 };
  const aspect = Math.min(bounds.width, bounds.height) / Math.max(1, Math.max(bounds.width, bounds.height));
  const fittedRoundness = clamp((1 - residual * 3.1) * 0.78 + aspect * 0.22);
  const roundness = topology?.closed ? topology.perfection : referenceRing?.roundness ?? fittedRoundness;
  const coverage = measureOpenCoverage(strokes, { center, radius }, config);
  const complete = Boolean(topology?.closed);
  const completeness = complete ? 1 : coverage.coverageRatio;
  const circumference = Math.PI * 2 * radius;
  const inkLength = strokes.reduce((sum, stroke) => sum + strokeLength(stroke), 0);
  const overdraw = Math.max(0, inkLength / Math.max(1, circumference) - 1.08);
  const closureQuality = complete ? topology.perfection : clamp(coverage.coverageRatio);
  const lineSmoothness = clamp((complete ? topology.perfection : coverage.nearCircleInkRatio) * 0.72 + (1 - residual) * 0.28 - overdraw * 0.12);
  const neatness = clamp(roundness * 0.42 + lineSmoothness * 0.36 + closureQuality * 0.22);

  return {
    found: true,
    center,
    radius,
    complete,
    completeness,
    coverageRatio: coverage.coverageRatio,
    gap: coverage.gap,
    gapArcLength: coverage.gapArcLength,
    roundness,
    lineSmoothness,
    neatness,
    overdrawAmount: clamp(overdraw, 0, 1),
    strokeIds: strokes.map((stroke) => stroke.id)
  };
}

function collectOpenRingStrokes(seedRing, strokes, config) {
  const circle = { center: seedRing.center, radius: seedRing.radius };
  return strokes.filter((stroke) => {
    if (seedRing.strokeIds.includes(stroke.id)) {
      return true;
    }

    const metrics = strokeCircleMetrics(stroke, circle, config);
    return metrics.nearRatio >= OPEN_COLLECTION_MIN_RATIO;
  });
}

function strokeAngularCoverage(stroke, circle, config) {
  const bins = new Array(RING_BIN_COUNT).fill(false);
  const metrics = strokeCircleMetrics(stroke, circle, config, bins);
  const coveredBinCount = bins.filter(Boolean).length;
  return {
    ...metrics,
    coveredBinCount,
    angularSpanDeg: coveredBinCount * (360 / Math.max(1, bins.length))
  };
}

function pruneRedundantShortRingStrokes(ringStrokes, circle, config) {
  let kept = [...ringStrokes];

  for (const stroke of [...ringStrokes].sort((a, b) => strokeLength(a) - strokeLength(b))) {
    if (kept.length <= 1 || !kept.some((item) => item.id === stroke.id)) {
      continue;
    }

    const coverage = strokeAngularCoverage(stroke, circle, config);
    if (coverage.angularSpanDeg > TOPOLOGY_RING_PRUNE_MAX_ANGULAR_SPAN_DEG) {
      continue;
    }

    const withoutStroke = kept.filter((item) => item.id !== stroke.id);
    const withoutCoverage = measureOpenCoverage(withoutStroke, circle, config);
    const withoutTopology = analyzeTopologicalClosure(withoutStroke, config);
    if (withoutCoverage.coverageRatio >= TOPOLOGY_RING_PRUNE_COVERAGE_FLOOR && withoutTopology.closed) {
      kept = withoutStroke;
    }
  }

  return kept;
}

function collectTopologicalRingStrokes(strokes, topology, config) {
  const edgeStrokeIds = new Set(topology.strokeIds);
  const edgeStrokes = strokes.filter((stroke) => edgeStrokeIds.has(stroke.id));
  const refinedCircle = fitCircle(allPoints(edgeStrokes)) ?? { center: topology.center, radius: topology.radius };
  const ringStrokes = edgeStrokes.filter((stroke) => {
    const metrics = strokeCircleMetrics(stroke, refinedCircle, config);
    return (
      metrics.nearLength >= TOPOLOGY_RING_STROKE_MIN_NEAR_CIRCLE_LENGTH_PX &&
      metrics.nearRatio >= TOPOLOGY_RING_STROKE_MIN_NEAR_CIRCLE_RATIO
    );
  });

  return ringStrokes.length ? pruneRedundantShortRingStrokes(ringStrokes, refinedCircle, config) : edgeStrokes;
}

// When a nearly complete ring already exists, retry closure using only strokes near
// that ring so distant stray marks cannot distort flood-fill bounds or circle scoring.
function closureRelevantStrokes(strokes, referenceRing, config) {
  if (!referenceRing?.found) {
    return strokes;
  }

  const previousRingStrokeIds = new Set(referenceRing.strokeIds ?? []);
  const boundaryRadius = referenceRing.radius * config.layers.boundaryMax;

  return strokes.filter((stroke) => {
    if (previousRingStrokeIds.has(stroke.id)) {
      return true;
    }

    const pointCount = Math.max(1, stroke.points.length);
    const insideOrBoundaryRatio =
      stroke.points.filter((point) => distance(point, referenceRing.center) <= boundaryRadius).length / pointCount;

    return insideOrBoundaryRatio >= MIN_CLOSURE_RELEVANT_POINT_RATIO;
  });
}

function scoreCandidate(ring, config) {
  if (!ring || ring.radius < config.ring.minRadius) {
    return 0;
  }
  const radiusScore = clamp((ring.radius - config.ring.minRadius) / 180);
  const closureBonus = ring.complete ? 0.3 : 0;
  return clamp(
    ring.completeness * 0.38 + ring.roundness * 0.25 + ring.neatness * 0.19 + radiusScore * 0.08 + closureBonus,
    0,
    1.3
  );
}

function addTopologicalCandidate(candidates, strokes, config) {
  const topology = analyzeTopologicalClosure(strokes, config);
  if (topology.closed) {
    const ringStrokes = collectTopologicalRingStrokes(strokes, topology, config);
    const measured = measureRing(ringStrokes.length ? ringStrokes : strokes, config, null, topology);
    const score = scoreCandidate(measured, config);
    if (measured && score > 0) {
      candidates.push({
        ...measured,
        score
      });
    }
  }

  return topology;
}

// Finds prepared rings before they are topologically closed. Each long, wide
// stroke gets one chance to act as a seed circle. Nearby strokes are then
// gathered onto that circle and scored as one open ring candidate.
function buildOpenRingCandidates(strokes, config) {
  const candidates = [];
  const seeds = strokes.filter((stroke) => {
    const length = stroke.metrics?.length ?? strokeLength(stroke);
    const bounds = stroke.metrics?.bounds ?? boundsForStrokes([stroke]);
    const diagonal = Math.hypot(bounds.width, bounds.height);
    return length >= MIN_SEED_LENGTH_PX && diagonal >= config.ring.minRadius * 1.35;
  });

  for (const seed of seeds) {
    const firstPass = measureRing([seed], config);
    if (!firstPass) {
      continue;
    }
    const ringStrokes = collectOpenRingStrokes(firstPass, strokes, config);
    const measured = measureRing(ringStrokes, config, firstPass);
    const score = scoreCandidate(measured, config);
    if (
      measured &&
      score > 0 &&
      measured.completeness >= FOUND_COMPLETENESS &&
      measured.roundness >= MIN_ROUNDNESS
    ) {
      candidates.push({
        ...measured,
        score
      });
    }
  }

  return candidates;
}

function addReferenceFilteredClosureCandidate(candidates, strokes, reference, config) {
  if (!reference) {
    return false;
  }

  const relevantStrokes = closureRelevantStrokes(strokes, reference, config);
  if (relevantStrokes.length === strokes.length || relevantStrokes.length < 2) {
    return false;
  }

  const previousCandidateCount = candidates.length;
  addTopologicalCandidate(candidates, relevantStrokes, config);
  return candidates.length > previousCandidateCount;
}

function bestOpenRingCandidate(openCandidates) {
  return [...openCandidates]
    .filter((candidate) => !candidate.complete)
    .sort((a, b) => b.score + b.radius * 0.001 - (a.score + a.radius * 0.001))[0] ?? null;
}

function closureReferenceRing(previousRing, openCandidates) {
  if (previousRing?.found && !previousRing.complete) {
    return previousRing;
  }
  return bestOpenRingCandidate(openCandidates);
}

function isSamePhysicalRing(a, b) {
  const averageRadius = Math.max(1, (a.radius + b.radius) / 2);
  const centerDistance = distance(a.center, b.center);
  const radiusRatio = Math.abs(a.radius - b.radius) / averageRadius;
  return centerDistance <= averageRadius * SAME_RING_CENTER_DISTANCE_RATIO && radiusRatio <= SAME_RING_RADIUS_RATIO;
}

function distinctRingCandidates(candidates) {
  const distinct = [];
  for (const candidate of candidates) {
    if (!distinct.some((existing) => isSamePhysicalRing(existing, candidate))) {
      distinct.push(candidate);
    }
  }
  return distinct;
}

function summarizeUnsupportedRing(candidate) {
  return {
    center: candidate.center,
    radius: candidate.radius,
    complete: candidate.complete,
    completeness: candidate.completeness,
    strokeIds: candidate.strokeIds
  };
}

// Ring detection combines a geometric prepared-ring pass with a topological
// sealed-ring pass:
// 1. Build open candidates by fitting circles to long seed strokes, gathering
//    nearby ring-like strokes, then scoring angular coverage and roundness.
// 2. Choose a closure reference from the previous open ring, or from the best
//    current open candidate. When there is a reference, retry flood-fill closure
//    with only strokes relevant to that ring so distant outside marks do not
//    distort the closure test.
// 3. If the filtered closure pass did not produce a closed candidate, run the
//    flood-fill closure test against all strokes.
// 4. Merge duplicate candidates for the same physical ring, prefer complete
//    rings, and report any additional distinct rings as unsupported.
// 5. Emit activation only for the transition from a prepared open ring to a
//    sealed ring, not for rings that are already closed on first detection.
export function detectRing(strokes, previousRing, config) {
  const candidates = [];

  const openCandidates = buildOpenRingCandidates(strokes, config);

  const reference = closureReferenceRing(previousRing, openCandidates);
  const filteredClosureFound = addReferenceFilteredClosureCandidate(candidates, strokes, reference, config);
  const topology = filteredClosureFound ? null : addTopologicalCandidate(candidates, strokes, config);
  candidates.push(...openCandidates);

  if (!candidates.length) {
    return {
      found: false,
      complete: false,
      completeness: 0,
      activationEvent: false,
      strokeIds: [],
      unsupportedNestedRings: []
    };
  }

  candidates.sort((a, b) => Number(b.complete) - Number(a.complete) || b.score + b.radius * 0.001 - (a.score + a.radius * 0.001));
  const distinctRings = distinctRingCandidates(candidates);
  const ring = distinctRings[0];
  const unsupportedMultipleRings = distinctRings.slice(1).map(summarizeUnsupportedRing);
  const unsupportedNestedRings = distinctRings
    .slice(1)
    .filter(
      (candidate) =>
        candidate.radius < ring.radius * 0.78 &&
        candidate.roundness >= 0.68 &&
        candidate.complete
    )
    .map(summarizeUnsupportedRing);

  const activationEvent = Boolean(
      previousRing?.found &&
      !previousRing.complete &&
      ring.complete &&
      previousRing.completeness >= ACTIVATION_COMPLETENESS_FLOOR &&
      unsupportedMultipleRings.length === 0
  );

  return {
    ...ring,
    activationEvent,
    unsupportedNestedRings,
    unsupportedMultipleRings
  };
}
