import { clamp } from "../utils/geometry.js";
import type { AppConfig, LayerOrAny } from "../types.js";

export function mapRadiusToLayer(radiusNorm: number, config: AppConfig) {
  const layers = config.layers;
  let layer: LayerOrAny = "outside";

  if (radiusNorm <= layers.centerMax) {
    layer = "center";
  } else if (radiusNorm <= layers.middleMax) {
    layer = "middle";
  } else if (radiusNorm <= layers.outerMax) {
    layer = "outer";
  } else if (radiusNorm <= layers.boundaryMax) {
    layer = "ringBoundary";
  }

  const boundaries = [0, layers.centerMax, layers.middleMax, layers.outerMax, layers.boundaryMax];
  const nearestBoundaryDistance = Math.min(...boundaries.map((boundary) => Math.abs(radiusNorm - boundary)));
  const boundaryDistanceScore = clamp(nearestBoundaryDistance / Math.max(0.001, layers.boundaryTolerance));

  return {
    layer,
    nearBoundary: boundaryDistanceScore < 0.55
  };
}
