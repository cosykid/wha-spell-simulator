import type { Bounds, Point, Stroke, Vector } from '../types.js';

const FULL_CIRCLE_DEG = 360;
const HALF_CIRCLE_DEG = 180;

export function clamp(value: number, min = 0, max = 1): number {
	return Math.max(min, Math.min(max, value));
}

export function clampSigned(value: number, limit: number): number {
	return clamp(value, -limit, limit);
}

export function roundedDegrees(value: number): number {
	return Math.round(value * 1000) / 1000;
}

export function randomBetween(min: number, max: number): number {
	return min + Math.random() * (max - min);
}

export function perpendicularVector(vector: Vector): Vector {
	return {
		x: -vector.y,
		y: vector.x
	};
}

export function normalizeVector(vector: Vector): Vector {
	const magnitude = Math.hypot(vector.x, vector.y);
	if (magnitude < 0.001) {
		return { x: 0, y: -1 };
	}
	return {
		x: vector.x / magnitude,
		y: vector.y / magnitude
	};
}

export function normalizeAngleDeg(value: number): number {
	return ((value % FULL_CIRCLE_DEG) + FULL_CIRCLE_DEG) % FULL_CIRCLE_DEG;
}

export function degreesToRadians(degrees: number): number {
	return (degrees * Math.PI) / HALF_CIRCLE_DEG;
}

export function radiansToDegrees(radians: number): number {
	return (radians * HALF_CIRCLE_DEG) / Math.PI;
}

export function distance(a: Vector, b: Vector): number {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return Math.hypot(dx, dy);
}

export function pointToSegmentDistance(point: Vector, start: Vector, end: Vector): number {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const lengthSq = dx * dx + dy * dy;
	if (lengthSq < 1e-12) {
		return distance(point, start);
	}
	const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq);
	return distance(point, { x: start.x + dx * t, y: start.y + dy * t });
}

function orientation(a: Vector, b: Vector, c: Vector): number {
	return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsCross(a1: Vector, a2: Vector, b1: Vector, b2: Vector): boolean {
	const o1 = orientation(a1, a2, b1);
	const o2 = orientation(a1, a2, b2);
	const o3 = orientation(b1, b2, a1);
	const o4 = orientation(b1, b2, a2);
	return o1 * o2 < 0 && o3 * o4 < 0;
}

export function segmentToSegmentDistance(a1: Vector, a2: Vector, b1: Vector, b2: Vector): number {
	if (segmentsCross(a1, a2, b1, b2)) {
		return 0;
	}
	return Math.min(
		pointToSegmentDistance(a1, b1, b2),
		pointToSegmentDistance(a2, b1, b2),
		pointToSegmentDistance(b1, a1, a2),
		pointToSegmentDistance(b2, a1, a2)
	);
}

export function pathLength(points: Vector[]): number {
	let length = 0;
	for (let index = 1; index < points.length; index += 1) {
		length += distance(points[index - 1], points[index]);
	}
	return length;
}

export function strokeLength(stroke: { points?: Point[] }): number {
	return pathLength(stroke.points ?? []);
}

export function allPoints(strokes: { points?: Point[] }[]): Point[] {
	return strokes.flatMap((stroke) => stroke.points ?? []);
}

export function boundsForPoints(points: Vector[]): Bounds {
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

export function boundsForStrokes(strokes: { points?: Point[] }[]): Bounds {
	return boundsForPoints(allPoints(strokes));
}

export function centerOfBounds(bounds: Bounds): Vector {
	return {
		x: bounds.minX + bounds.width / 2,
		y: bounds.minY + bounds.height / 2
	};
}

function centroid(points: Vector[]): Vector {
	if (!points.length) {
		return { x: 0, y: 0 };
	}
	const total = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), {
		x: 0,
		y: 0
	});
	return {
		x: total.x / points.length,
		y: total.y / points.length
	};
}

export function expandBounds(bounds: Bounds, amount: number): Bounds {
	return {
		minX: bounds.minX - amount,
		minY: bounds.minY - amount,
		maxX: bounds.maxX + amount,
		maxY: bounds.maxY + amount,
		width: bounds.width + amount * 2,
		height: bounds.height + amount * 2
	};
}

export function boundsOverlap(a: Bounds, b: Bounds): boolean {
	return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function angleDegFromCenter(point: Vector, center: Vector): number {
	return normalizeAngleDeg(radiansToDegrees(Math.atan2(center.y - point.y, point.x - center.x)));
}

function angleFromCanvasVector(x: number, y: number): number {
	return normalizeAngleDeg(radiansToDegrees(Math.atan2(-y, x)));
}

export function vectorFromAngleDeg(angleDeg: number): Vector {
	const radians = degreesToRadians(angleDeg);
	return {
		x: Math.cos(radians),
		y: -Math.sin(radians)
	};
}

export function angularDifference(a: number, b: number): number {
	const diff = Math.abs(normalizeAngleDeg(a) - normalizeAngleDeg(b)) % FULL_CIRCLE_DEG;
	return diff > HALF_CIRCLE_DEG ? FULL_CIRCLE_DEG - diff : diff;
}

/** Degrees from one bearing to another in (-180, 180]. Positive turns counter-clockwise. */
export function signedAngleDifferenceDeg(fromDeg: number, toDeg: number): number {
	const wrapped = normalizeAngleDeg(toDeg - fromDeg);
	return wrapped > HALF_CIRCLE_DEG ? wrapped - FULL_CIRCLE_DEG : wrapped;
}

export function mean(values: number[]): number {
	if (!values.length) {
		return 0;
	}
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function stddev(values: number[]): number {
	if (values.length < 2) {
		return 0;
	}
	const average = mean(values);
	const variance = mean(values.map((value) => (value - average) ** 2));
	return Math.sqrt(variance);
}

// Finds the undirected dominant axis of a point cloud. Use directedStrokeAngle for draw direction.
export function dominantAxisOrientationDeg(points: Vector[]): number {
	if (points.length < 2) {
		return 0;
	}

	const center = centroid(points);
	let xx = 0;
	let xy = 0;
	let yy = 0;

	for (const point of points) {
		const dx = point.x - center.x;
		const dy = point.y - center.y;
		xx += dx * dx;
		xy += dx * dy;
		yy += dy * dy;
	}

	const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
	return normalizeAngleDeg(angleFromCanvasVector(Math.cos(angle), Math.sin(angle)));
}

export function lineSpreadRatio(points: Vector[]): number {
	if (points.length < 3) {
		return 0;
	}

	const center = centroid(points);
	let xx = 0;
	let xy = 0;
	let yy = 0;

	for (const point of points) {
		const dx = point.x - center.x;
		const dy = point.y - center.y;
		xx += dx * dx;
		xy += dx * dy;
		yy += dy * dy;
	}

	xx /= points.length;
	xy /= points.length;
	yy /= points.length;

	const trace = xx + yy;
	const root = Math.sqrt(Math.max(0, (xx - yy) ** 2 + 4 * xy * xy));
	const major = (trace + root) / 2;
	const minor = (trace - root) / 2;

	if (major <= 0.000001) {
		return 0;
	}

	return clamp(Math.sqrt(Math.max(0, minor) / major));
}

export function directedStrokeAngle(strokes: Stroke[]): number {
	const firstStroke = strokes.find((stroke) => stroke.points.length > 1);
	const lastStroke = [...strokes].reverse().find((stroke) => stroke.points.length > 1);
	if (!firstStroke || !lastStroke) {
		return 0;
	}
	const first = firstStroke.points[0];
	const last = lastStroke.points[lastStroke.points.length - 1];
	return angleFromCanvasVector(last.x - first.x, last.y - first.y);
}

export function endpointClosedness(strokes: Stroke[], size: number): number {
	const endpoints = strokes.flatMap((stroke) => {
		if (stroke.points.length < 2) {
			return [];
		}
		return [stroke.points[0], stroke.points[stroke.points.length - 1]];
	});

	if (endpoints.length < 2 || size <= 0) {
		return 0;
	}

	let minEndpointDistance = Infinity;
	for (let a = 0; a < endpoints.length; a += 1) {
		for (let b = a + 1; b < endpoints.length; b += 1) {
			minEndpointDistance = Math.min(minEndpointDistance, distance(endpoints[a], endpoints[b]));
		}
	}

	return clamp(1 - minEndpointDistance / Math.max(8, size * 0.28));
}

export function formatNumber<T>(value: T, digits = 3): T {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return value;
	}
	return Number(value.toFixed(digits)) as unknown as T;
}
