/**
 * @file Ramer-Douglas-Peucker path simplification: drops the points a polyline
 * can lose without moving more than a tolerance from its original shape.
 *
 * Used to thin drawn strokes down to what a small preview can actually show. A
 * seal recorded at pointer resolution carries hundreds of points per stroke,
 * and a thumbnail a couple of hundred pixels wide cannot draw the difference.
 */
import { pointToSegmentDistance } from './geometry.js';
import type { Vector } from '../types.js';

/**
 * Simplifies a polyline, keeping every point that sits further than `tolerance`
 * from the chord its neighbours would form without it. Endpoints always survive.
 *
 * `tolerance` is in the caller's own units, so a path fitted into a 100 wide
 * preview box is simplified in hundredths of that box.
 *
 * @example
 * ```ts
 * simplifyPath(points, 0.25); // fitted preview points, quarter-unit tolerance
 * ```
 */
export function simplifyPath<T extends Vector>(points: T[], tolerance: number): T[] {
	if (points.length < 3 || tolerance <= 0) {
		return points;
	}

	const keep = new Uint8Array(points.length);
	keep[0] = 1;
	keep[points.length - 1] = 1;

	// Iterative rather than recursive: a stroke can be thousands of points long
	// and a degenerate one would split all the way down.
	const pending: [number, number][] = [[0, points.length - 1]];
	while (pending.length > 0) {
		const [start, end] = pending.pop()!;
		let furthest = -1;
		let furthestDistance = tolerance;
		for (let index = start + 1; index < end; index += 1) {
			const distance = pointToSegmentDistance(points[index], points[start], points[end]);
			if (distance > furthestDistance) {
				furthest = index;
				furthestDistance = distance;
			}
		}
		if (furthest > start) {
			keep[furthest] = 1;
			pending.push([start, furthest], [furthest, end]);
		}
	}

	return points.filter((_, index) => keep[index] === 1);
}
