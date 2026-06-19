import { allPoints, boundsForStrokes, centerOfBounds } from '../../utils/geometry.js';
import type { Stroke, Vector } from '../../types.js';
import type { Circle } from './types.js';

function solve3(matrix: number[][], vector: number[]): number[] | null {
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

/**
 * Fits a circle to points using a lightweight linearized least-squares solve.
 *
 * Returns `null` for too few points or degenerate systems so callers can fall
 * back to bounds-derived circles.
 */
export function fitCircle(points: Vector[]): Circle | null {
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

/** Builds a coarse fallback circle from a stroke-set bounding box. */
export function fallbackCircle(strokes: Stroke[]): Circle {
	const bounds = boundsForStrokes(strokes);
	return {
		center: centerOfBounds(bounds),
		radius: (bounds.width + bounds.height) / 4
	};
}

/** Convenience wrapper for fitting a circle to all stroke points. */
export function fitStrokeCircle(strokes: Stroke[]): Circle | null {
	return fitCircle(allPoints(strokes));
}
