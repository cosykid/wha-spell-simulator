/**
 * @file Ink distance helpers shared by affinity and the tests.
 */
import {
	distance,
	pointToSegmentDistance,
	segmentToSegmentDistance
} from '../../utils/geometry.js';
import type { CleanedStroke, Stroke } from '../../types.js';

/** Minimum endpoint distance between two strokes. */
export function endpointDistance(a: Stroke, b: Stroke): number {
	const endpointsA = [a.points[0], a.points[a.points.length - 1]].filter(Boolean);
	const endpointsB = [b.points[0], b.points[b.points.length - 1]].filter(Boolean);
	let best = Infinity;
	for (const pointA of endpointsA) {
		for (const pointB of endpointsB) {
			best = Math.min(best, distance(pointA, pointB));
		}
	}
	return best;
}

function sampledStrokePoints(stroke: Stroke): Stroke['points'] {
	const points = stroke.points ?? [];
	if (points.length <= 28) {
		return points;
	}

	const stride = Math.ceil(points.length / 28);
	return points.filter(
		(_, index) => index === 0 || index === points.length - 1 || index % stride === 0
	);
}

function pointToPolylineDistance(
	point: Stroke['points'][number],
	points: Stroke['points']
): number {
	if (points.length === 0) {
		return Infinity;
	}
	if (points.length === 1) {
		return distance(point, points[0]);
	}

	let best = Infinity;
	for (let index = 1; index < points.length; index += 1) {
		best = Math.min(best, pointToSegmentDistance(point, points[index - 1], points[index]));
	}
	return best;
}

/** Approximate closest ink distance between sampled stroke polylines. */
export function pointDistance(a: Stroke, b: Stroke): number {
	const pointsA = sampledStrokePoints(a);
	const pointsB = sampledStrokePoints(b);
	if (!pointsA.length || !pointsB.length) {
		return Infinity;
	}
	if (pointsA.length === 1) {
		return pointToPolylineDistance(pointsA[0], pointsB);
	}
	if (pointsB.length === 1) {
		return pointToPolylineDistance(pointsB[0], pointsA);
	}

	let best = Infinity;
	for (let aIndex = 1; aIndex < pointsA.length; aIndex += 1) {
		for (let bIndex = 1; bIndex < pointsB.length; bIndex += 1) {
			best = Math.min(
				best,
				segmentToSegmentDistance(
					pointsA[aIndex - 1],
					pointsA[aIndex],
					pointsB[bIndex - 1],
					pointsB[bIndex]
				)
			);
		}
	}
	return best;
}

/** Distance between two cleaned-stroke bounding boxes. */
export function boundsGap(a: CleanedStroke, b: CleanedStroke): number {
	const dx = Math.max(
		0,
		Math.max(
			a.metrics.bounds.minX - b.metrics.bounds.maxX,
			b.metrics.bounds.minX - a.metrics.bounds.maxX
		)
	);
	const dy = Math.max(
		0,
		Math.max(
			a.metrics.bounds.minY - b.metrics.bounds.maxY,
			b.metrics.bounds.minY - a.metrics.bounds.maxY
		)
	);
	return Math.hypot(dx, dy);
}
