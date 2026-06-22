import { pathLength, pointToSegmentDistance, segmentToSegmentDistance } from './geometry.js';
import type { Point, Stroke, Vector } from '../types.js';

export interface EraseOptions {
	radius: number;
	minRemnantLength: number;
}

export interface EraseResult {
	strokes: Stroke[];
	changed: boolean;
}

/**
 * Erases ink under an eraser capsule: the segment `from -> to` swept with
 * `radius` (a pointerdown dab is the degenerate case `from === to`). Strokes
 * are split into surviving sub-strokes around the erased portions; survivors
 * shorter than `minRemnantLength` are dropped. Untouched strokes keep their
 * identity (same object) so callers can cheaply detect no-op gestures.
 */
export function eraseSegment(
	strokes: Stroke[],
	from: Vector,
	to: Vector,
	options: EraseOptions
): EraseResult {
	const result: Stroke[] = [];
	let changed = false;
	for (const stroke of strokes) {
		const survivors = eraseFromStroke(stroke, from, to, options);
		if (survivors === null) {
			result.push(stroke);
			continue;
		}
		changed = true;
		result.push(...survivors);
	}
	return { strokes: result, changed };
}

/** Returns the surviving sub-strokes, or null when the stroke is untouched. */
function eraseFromStroke(
	stroke: Stroke,
	from: Vector,
	to: Vector,
	{ radius, minRemnantLength }: EraseOptions
): Stroke[] | null {
	const points = stroke.points;
	const keep = points.map((point) => pointToSegmentDistance(point, from, to) > radius);
	// A stroke segment can pass through the capsule even when both of its
	// endpoints stay outside the radius; cut between those points too.
	const cutAfter = points.map((_, index) => {
		if (index >= points.length - 1 || !keep[index] || !keep[index + 1]) {
			return false;
		}
		return segmentToSegmentDistance(points[index], points[index + 1], from, to) <= radius;
	});

	if (keep.every(Boolean) && !cutAfter.some(Boolean)) {
		return null;
	}

	const runs: Point[][] = [];
	let run: Point[] = [];
	for (let index = 0; index < points.length; index += 1) {
		if (keep[index]) {
			run.push(points[index]);
		}
		if (!keep[index] || cutAfter[index]) {
			if (run.length) {
				runs.push(run);
			}
			run = [];
		}
	}
	if (run.length) {
		runs.push(run);
	}

	return runs
		.filter((runPoints) => runPoints.length >= 2 && pathLength(runPoints) >= minRemnantLength)
		.map((runPoints, index) => ({
			...stroke,
			id: `${stroke.id}/${index + 1}`,
			points: runPoints.map((point) => ({ ...point })),
			metrics: undefined
		}));
}
