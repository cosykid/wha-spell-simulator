import { clamp, degreesToRadians, distance, pathLength } from '../../utils/geometry.js';
import type { Point, Stroke, Vector } from '../../types.js';
import { POINT_CLOUD_SIZE, POINT_DISTANCE_NORMALIZER } from './constants.js';
import type { NormalizedShape, ShapeNormalizeOptions } from './types.js';

function asPointArray(stroke: Point[] | Stroke): Point[] {
	return Array.isArray(stroke) ? stroke : (stroke.points ?? []);
}

function boundsForVectors(points: Vector[]) {
	if (!points.length) {
		return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
	}

	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const point of points) {
		minX = Math.min(minX, point.x);
		minY = Math.min(minY, point.y);
		maxX = Math.max(maxX, point.x);
		maxY = Math.max(maxY, point.y);
	}

	return {
		minX,
		minY,
		maxX,
		maxY,
		width: maxX - minX,
		height: maxY - minY
	};
}

function rotateNormalizedPoint(point: Vector, rotationDeg = 0): Vector {
	if (!rotationDeg) {
		return point;
	}

	const radians = degreesToRadians(rotationDeg);
	const cos = Math.cos(radians);
	const sin = Math.sin(radians);
	const x = point.x - 0.5;
	const y = point.y - 0.5;
	return {
		x: x * cos - y * sin + 0.5,
		y: x * sin + y * cos + 0.5
	};
}

function resamplePoints(points: Vector[], targetCount: number): Vector[] {
	if (!points.length || targetCount <= 0) {
		return [];
	}
	if (points.length === 1 || targetCount === 1) {
		return Array.from({ length: targetCount }, () => ({ ...points[0] }));
	}

	const cumulative = [0];
	for (let index = 1; index < points.length; index += 1) {
		cumulative.push(cumulative[index - 1] + distance(points[index - 1], points[index]));
	}

	const total = cumulative[cumulative.length - 1];
	if (total <= 0.0001) {
		return Array.from({ length: targetCount }, () => ({ ...points[0] }));
	}

	const samples: Vector[] = [];
	let segmentIndex = 1;
	for (let sample = 0; sample < targetCount; sample += 1) {
		const target = (total * sample) / Math.max(1, targetCount - 1);
		while (segmentIndex < cumulative.length - 1 && cumulative[segmentIndex] < target) {
			segmentIndex += 1;
		}

		const previousDistance = cumulative[segmentIndex - 1];
		const nextDistance = cumulative[segmentIndex];
		const local = clamp(
			(target - previousDistance) / Math.max(0.0001, nextDistance - previousDistance)
		);
		const previous = points[segmentIndex - 1];
		const next = points[segmentIndex];
		samples.push({
			x: previous.x + (next.x - previous.x) * local,
			y: previous.y + (next.y - previous.y) * local
		});
	}

	return samples;
}

function sampleCountsForStrokes(strokes: Vector[][], pointCount: number): number[] {
	if (!strokes.length) {
		return [];
	}

	const lengths = strokes.map((stroke) => pathLength(stroke));
	const totalLength = lengths.reduce((sum, length) => sum + length, 0);
	const baseCounts = strokes.map(() => 1);
	let remaining = Math.max(0, pointCount - baseCounts.length);

	if (remaining <= 0) {
		return baseCounts;
	}

	const shares = lengths.map((length) =>
		totalLength > 0.0001 ? (length / totalLength) * remaining : remaining / strokes.length
	);
	const fractional = shares.map((share, index) => ({
		index,
		fraction: share - Math.floor(share)
	}));
	const counts = baseCounts.map((base, index) => base + Math.floor(shares[index]));
	remaining = pointCount - counts.reduce((sum, count) => sum + count, 0);

	for (const item of fractional.sort((a, b) => b.fraction - a.fraction)) {
		if (remaining <= 0) {
			break;
		}
		counts[item.index] += 1;
		remaining -= 1;
	}

	while (counts.reduce((sum, count) => sum + count, 0) > pointCount) {
		const largest = counts.reduce((best, count, index) => (count > counts[best] ? index : best), 0);
		if (counts[largest] <= 1) {
			break;
		}
		counts[largest] -= 1;
	}

	return counts;
}

/**
 * Fits raw strokes into a unit square and samples them into a fixed-size point cloud.
 *
 * The normalized strokes preserve stroke boundaries for ink rendering, while
 * `pointCloud` gives the matcher a stable order-independent geometric signal.
 */
export function normalizeStrokesForShape(
	strokes: Array<Point[] | Stroke>,
	options: ShapeNormalizeOptions = {}
): NormalizedShape {
	const pointCount = options.pointCount ?? POINT_CLOUD_SIZE;
	const sourceStrokes = strokes
		.map(asPointArray)
		.filter((points) => points.length > 0)
		.map((points) => points.map((point) => ({ x: point.x, y: point.y })));
	const points = sourceStrokes.flat();

	if (!points.length) {
		return {
			strokes: [],
			pointCloud: []
		};
	}

	const bounds = boundsForVectors(points);
	const scale = Math.max(bounds.width, bounds.height, 0.0001);
	const center = {
		x: bounds.minX + bounds.width / 2,
		y: bounds.minY + bounds.height / 2
	};
	const normalizedStrokes = sourceStrokes.map((stroke) =>
		stroke.map((point) =>
			rotateNormalizedPoint(
				{
					x: (point.x - center.x) / scale + 0.5,
					y: (point.y - center.y) / scale + 0.5
				},
				options.rotationDeg ?? 0
			)
		)
	);
	const sampleCounts = sampleCountsForStrokes(normalizedStrokes, pointCount);
	const pointCloud = normalizedStrokes.flatMap((stroke, index) =>
		resamplePoints(stroke, sampleCounts[index] ?? 0)
	);

	return {
		strokes: normalizedStrokes,
		pointCloud
	};
}

function greedyCloudDistance(a: Vector[], b: Vector[]): number {
	if (!a.length || !b.length) {
		return 1;
	}

	// Flat coordinate arrays and squared-distance comparisons keep this hot
	// n^2 loop cheap: square root is monotonic, so ranking by squared distance
	// picks the same match and only the winner needs the root.
	const bx = new Float64Array(b.length);
	const by = new Float64Array(b.length);
	for (let index = 0; index < b.length; index += 1) {
		bx[index] = b[index].x;
		by[index] = b[index].y;
	}

	const used = new Uint8Array(b.length);
	let total = 0;
	for (const point of a) {
		const px = point.x;
		const py = point.y;
		let bestIndex = -1;
		let bestSquared = Infinity;
		for (let index = 0; index < b.length; index += 1) {
			if (used[index]) {
				continue;
			}
			const dx = px - bx[index];
			const dy = py - by[index];
			const squared = dx * dx + dy * dy;
			if (squared < bestSquared) {
				bestSquared = squared;
				bestIndex = index;
			}
		}
		if (bestIndex >= 0) {
			used[bestIndex] = 1;
			total += Math.sqrt(bestSquared);
		}
	}

	return total / Math.max(1, Math.min(a.length, b.length));
}

/** Symmetric greedy cloud distance normalized to [0, 1]. */
export function pointCloudDistance(a: Vector[], b: Vector[]): number {
	if (!a.length || !b.length) {
		return 1;
	}

	const rawDistance = (greedyCloudDistance(a, b) + greedyCloudDistance(b, a)) / 2;
	return clamp(rawDistance / POINT_DISTANCE_NORMALIZER);
}

/** Convenience wrapper that normalizes two stroke sets before point-cloud scoring. */
export function pointCloudDistanceForStrokes(
	a: Array<Point[] | Stroke>,
	b: Array<Point[] | Stroke>,
	options: ShapeNormalizeOptions = {}
): number {
	return pointCloudDistance(
		normalizeStrokesForShape(a, options).pointCloud,
		normalizeStrokesForShape(b, options).pointCloud
	);
}
