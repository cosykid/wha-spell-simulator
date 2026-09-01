/**
 * @file Arc-length walkers over a polyline's points, shared by the seal
 * ignition's warm front and the first-spell guide's ghost ink so partial-stroke
 * tracing has one source of truth.
 */

import type { Point } from '../types.js';

/** Total length of a polyline, summed segment by segment. */
export function polylineLength(points: readonly Point[]): number {
	let length = 0;
	for (let index = 1; index < points.length; index += 1) {
		const previous = points[index - 1];
		const point = points[index];
		length += Math.hypot(point.x - previous.x, point.y - previous.y);
	}
	return length;
}

/**
 * Adds the part of one polyline lying between two of its own arc lengths to the
 * current path. Contiguous, so a span crossing several segments is one line
 * rather than a row of overlapping caps.
 */
export function tracePathBetween(
	ctx: CanvasRenderingContext2D,
	points: readonly Point[],
	fromLen: number,
	toLen: number
): void {
	let walked = 0;
	let started = false;
	for (let index = 1; index < points.length; index += 1) {
		const previous = points[index - 1];
		const point = points[index];
		const segment = Math.hypot(point.x - previous.x, point.y - previous.y);
		const enter = Math.max(fromLen - walked, 0);
		const leave = Math.min(toLen - walked, segment);
		walked += segment;
		if (segment <= 0 || leave <= enter) {
			continue;
		}
		const dx = (point.x - previous.x) / segment;
		const dy = (point.y - previous.y) / segment;
		if (!started) {
			ctx.moveTo(previous.x + dx * enter, previous.y + dy * enter);
			started = true;
		}
		ctx.lineTo(previous.x + dx * leave, previous.y + dy * leave);
	}
}

/**
 * The point sitting at an arc length along a polyline, clamped to its ends.
 * Returns null for a polyline with no points.
 */
export function pointAtLength(points: readonly Point[], length: number): Point | null {
	if (points.length === 0) {
		return null;
	}
	if (length <= 0) {
		return points[0];
	}
	let walked = 0;
	for (let index = 1; index < points.length; index += 1) {
		const previous = points[index - 1];
		const point = points[index];
		const segment = Math.hypot(point.x - previous.x, point.y - previous.y);
		if (segment > 0 && walked + segment >= length) {
			const t = (length - walked) / segment;
			return {
				x: previous.x + (point.x - previous.x) * t,
				y: previous.y + (point.y - previous.y) * t
			};
		}
		walked += segment;
	}
	return points[points.length - 1];
}
