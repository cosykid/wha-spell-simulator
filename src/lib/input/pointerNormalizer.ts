import { distance } from '../utils/geometry.js';
import type { Point } from '../types.js';

// {x, y, pressure, t}
export function canvasPointFromEvent(event: PointerEvent, canvas: HTMLCanvasElement): Point {
	const rect = canvas.getBoundingClientRect();
	const scaleX = canvas.width / rect.width;
	const scaleY = canvas.height / rect.height;

	return {
		x: (event.clientX - rect.left) * scaleX,
		y: (event.clientY - rect.top) * scaleY,
		pressure: typeof event.pressure === 'number' && event.pressure > 0 ? event.pressure : 0.5,
		t: performance.now()
	};
}

export function shouldKeepPoint(points: Point[], point: Point, minDistance: number): boolean {
	if (points.length === 0) {
		return true;
	}
	return distance(points[points.length - 1]!, point) >= minDistance;
}
