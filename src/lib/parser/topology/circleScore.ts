import { clamp, distance, mean, stddev } from '../../utils/geometry.js';
import type { Vector } from '../../types.js';
import { MAX_NORMALIZED_RMSE } from './constants.js';

/** Scores how closely topology edge pixels fit a circle. */
export function scoreCircle(edgePixels: Vector[]) {
	if (edgePixels.length < 8) {
		return {
			center: { x: 0, y: 0 },
			radius: 0,
			rmse: Infinity,
			normalizedRmse: Infinity,
			perfection: 0
		};
	}

	const center = {
		x: mean(edgePixels.map((point) => point.x)),
		y: mean(edgePixels.map((point) => point.y))
	};
	const distances = edgePixels.map((point) => distance(point, center));
	const radius = mean(distances);
	const rmse = stddev(distances);
	const normalizedRmse = rmse / Math.max(1, radius);
	const perfection = clamp(1 - normalizedRmse / MAX_NORMALIZED_RMSE);

	return {
		center,
		radius,
		rmse,
		normalizedRmse,
		perfection
	};
}
