import {
	angularDifference,
	boundsOverlap,
	centerOfBounds,
	clamp,
	distance,
	expandBounds
} from '../../utils/geometry.js';
import { summarizePolar } from '../coordinateNormalizer.js';
import type { AppConfig, CleanedStroke, RingInfo, Stroke } from '../../types.js';
import {
	BBOX_PADDING_NORM,
	CENTER_DISTANCE_NORM,
	ENDPOINT_DISTANCE_NORM,
	MERGE_SCORE_FLOOR
} from './constants.js';

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
	return points.filter((_, index) => index % stride === 0);
}

/** Approximate closest-point distance between sampled stroke polylines. */
export function pointDistance(a: Stroke, b: Stroke): number {
	const pointsA = sampledStrokePoints(a);
	const pointsB = sampledStrokePoints(b);
	let best = Infinity;
	for (const pointA of pointsA) {
		for (const pointB of pointsB) {
			best = Math.min(best, distance(pointA, pointB));
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

/** Scores whether two strokes should be connected in the decomposition graph. */
export function strokePairProximity(
	a: CleanedStroke,
	b: CleanedStroke,
	ring: RingInfo,
	config: AppConfig
) {
	const radius = Math.max(1, ring.radius);
	const aCenter = centerOfBounds(a.metrics.bounds);
	const bCenter = centerOfBounds(b.metrics.bounds);
	const aPolar = summarizePolar(aCenter, ring, config);
	const bPolar = summarizePolar(bCenter, ring, config);
	const sameLayer = aPolar.layer === bPolar.layer || aPolar.nearBoundary || bPolar.nearBoundary;
	const angleDifference = angularDifference(aPolar.angleDeg, bPolar.angleDeg);
	const centerDistanceNorm = distance(aCenter, bCenter) / radius;
	const bboxDistanceNorm = boundsGap(a, b) / radius;
	const pointDistanceNorm = pointDistance(a, b) / radius;
	const centerCompatible =
		Math.min(aPolar.radiusNorm, bPolar.radiusNorm) <= config.layers.centerMax ||
		angleDifference <= 30;
	const bothCenter =
		Math.max(aPolar.radiusNorm, bPolar.radiusNorm) <=
		config.layers.centerMax + config.layers.boundaryTolerance * 1.5;
	const centerSigilCompatible = bothCenter && centerDistanceNorm <= 0.54;
	const paddedOverlap = boundsOverlap(
		expandBounds(a.metrics.bounds, radius * BBOX_PADDING_NORM),
		expandBounds(b.metrics.bounds, radius * BBOX_PADDING_NORM)
	);
	const connected =
		paddedOverlap ||
		pointDistanceNorm <= ENDPOINT_DISTANCE_NORM ||
		centerSigilCompatible ||
		(sameLayer && centerDistanceNorm <= CENTER_DISTANCE_NORM * 1.2 && centerCompatible);
	const weightedScore = clamp(
		clamp(1 - bboxDistanceNorm / 0.13) * 0.28 +
			clamp(1 - pointDistanceNorm / 0.12) * 0.34 +
			clamp(1 - centerDistanceNorm / 0.27) * 0.2 +
			(sameLayer ? 0.11 : 0.03) +
			clamp(1 - angleDifference / 42) * 0.07
	);
	const score = Math.max(
		weightedScore,
		paddedOverlap ? 0.72 : 0,
		pointDistanceNorm <= ENDPOINT_DISTANCE_NORM ? 0.68 : 0,
		centerSigilCompatible ? 0.6 : 0
	);

	return {
		connected,
		score
	};
}

/** Fallback grouping rule used when recognition-guided decomposition is disabled. */
export function shouldGroup(
	a: CleanedStroke,
	b: CleanedStroke,
	ring: RingInfo,
	config: AppConfig
): boolean {
	const padding = ring.radius * BBOX_PADDING_NORM;
	const aBounds = expandBounds(a.metrics.bounds, padding);
	const bBounds = expandBounds(b.metrics.bounds, padding);
	const aPolar = summarizePolar(centerOfBounds(a.metrics.bounds), ring, config);
	const bPolar = summarizePolar(centerOfBounds(b.metrics.bounds), ring, config);
	const sameLayer = aPolar.layer === bPolar.layer || aPolar.nearBoundary || bPolar.nearBoundary;
	const centersClose =
		distance(centerOfBounds(a.metrics.bounds), centerOfBounds(b.metrics.bounds)) <=
		ring.radius * CENTER_DISTANCE_NORM;
	const endpointsClose = endpointDistance(a, b) <= ring.radius * ENDPOINT_DISTANCE_NORM;
	return endpointsClose || (sameLayer && (boundsOverlap(aBounds, bBounds) || centersClose));
}

/** Returns true when two groups are close enough to merge as small fragments. */
export function groupsTouch(a: CleanedStroke[], b: CleanedStroke[], ring: RingInfo): boolean {
	const radius = Math.max(1, ring.radius);
	for (const strokeA of a) {
		for (const strokeB of b) {
			if (endpointDistance(strokeA, strokeB) <= radius * 0.045) {
				return true;
			}
			if (pointDistance(strokeA, strokeB) <= radius * 0.035) {
				return true;
			}
		}
	}
	return false;
}

/** Whether a pairwise score is high enough to create a merge edge. */
export function canMergeByProximity(
	a: CleanedStroke,
	b: CleanedStroke,
	ring: RingInfo,
	config: AppConfig
): boolean {
	const proximity = strokePairProximity(a, b, ring, config);
	return proximity.connected && proximity.score >= MERGE_SCORE_FLOOR;
}
