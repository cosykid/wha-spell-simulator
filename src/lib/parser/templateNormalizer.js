import { boundsForPoints, clamp, distance } from "../utils/geometry.js";

function asPointArray(stroke) {
  return Array.isArray(stroke) ? stroke : stroke.points ?? [];
}

function resampleStroke(points, targetCount) {
  if (!points.length || targetCount <= 0) {
    return [];
  }
  if (points.length === 1 || targetCount === 1) {
    return Array.from({ length: targetCount }, () => ({ x: points[0].x, y: points[0].y }));
  }

  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) {
    cumulative.push(cumulative[index - 1] + distance(points[index - 1], points[index]));
  }

  const total = cumulative[cumulative.length - 1];
  if (total <= 0.0001) {
    return Array.from({ length: targetCount }, () => ({ x: points[0].x, y: points[0].y }));
  }

  const result = [];
  let segmentIndex = 1;
  for (let sample = 0; sample < targetCount; sample += 1) {
    const target = (total * sample) / Math.max(1, targetCount - 1);
    while (segmentIndex < cumulative.length - 1 && cumulative[segmentIndex] < target) {
      segmentIndex += 1;
    }

    const previousDistance = cumulative[segmentIndex - 1];
    const nextDistance = cumulative[segmentIndex];
    const local = clamp((target - previousDistance) / Math.max(0.0001, nextDistance - previousDistance));
    const previous = points[segmentIndex - 1];
    const next = points[segmentIndex];
    result.push({
      x: previous.x + (next.x - previous.x) * local,
      y: previous.y + (next.y - previous.y) * local
    });
  }

  return result;
}

function roundPoint(point, digits) {
  const factor = 10 ** digits;
  return {
    x: Math.round(point.x * factor) / factor,
    y: Math.round(point.y * factor) / factor
  };
}

export function normalizeStrokesForTemplate(strokes, options = {}) {
  const samplesPerStroke = options.samplesPerStroke ?? 32;
  const digits = options.digits ?? 4;
  const sourceStrokes = strokes
    .map(asPointArray)
    .filter((points) => points.length > 0)
    .map((points) => points.map((point) => ({ x: point.x, y: point.y })));
  const allPoints = sourceStrokes.flat();

  if (!allPoints.length) {
    return {
      sourceAspectRatio: 1,
      strokes: []
    };
  }

  const bounds = boundsForPoints(allPoints);
  const scale = options.fitToBounds
    ? Math.max(bounds.width, bounds.height, 0.0001)
    : Math.max(bounds.width, bounds.height, 1);
  const center = {
    x: bounds.minX + bounds.width / 2,
    y: bounds.minY + bounds.height / 2
  };
  const normalizedStrokes = sourceStrokes.map((points) => {
    const sampled = resampleStroke(points, samplesPerStroke);
    return sampled.map((point) =>
      roundPoint(
        {
          x: (point.x - center.x) / scale + 0.5,
          y: (point.y - center.y) / scale + 0.5
        },
        digits
      )
    );
  });

  return {
    sourceAspectRatio:
      Math.round((bounds.width / Math.max(options.fitToBounds ? 0.0001 : 1, bounds.height)) * 1000) / 1000,
    strokes: normalizedStrokes
  };
}
