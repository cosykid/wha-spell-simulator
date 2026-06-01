import { boundsForPoints, pathLength } from "../utils/geometry.js";

function smoothPoints(points) {
  if (points.length < 4) {
    return points.map((point) => ({ ...point }));
  }

  return points.map((point, index) => {
    if (index === 0 || index === points.length - 1) {
      return { ...point };
    }
    const previous = points[index - 1];
    const next = points[index + 1];
    // Pull each interior point toward the midpoint of its neighbors to reduce
    // hand jitter while keeping the original stroke endpoints fixed.
    return {
      ...point,
      x: previous.x * 0.25 + point.x * 0.5 + next.x * 0.25,
      y: previous.y * 0.25 + point.y * 0.5 + next.y * 0.25
    };
  });
}

export function cleanStrokes(rawStrokes, config) {
  return rawStrokes
    .map((stroke) => {
      let points = stroke.points.map((point) => ({ ...point }));
      for (let pass = 0; pass < config.input.smoothingPasses; pass += 1) {
        points = smoothPoints(points);
      }

      const length = pathLength(points);
      const bounds = boundsForPoints(points);

      return {
        ...stroke,
        points,
        metrics: {
          length,
          bounds,
          pointCount: points.length
        }
      };
    })
    .filter((stroke) => stroke.metrics.length >= config.input.minStrokeLength);
}
