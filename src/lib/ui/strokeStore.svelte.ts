import type { Point, Stroke, StrokeStore } from '../types.js';

import { makeReactiveArrayWithHistory } from '$lib/structures/arrayWithHistory.svelte.js';

function scaleStroke(stroke: Stroke, scaleX: number, scaleY: number): Stroke {
	return {
		...stroke,
		points: stroke.points.map((point) => ({
			...point,
			x: point.x * scaleX,
			y: point.y * scaleY
		}))
	};
}

/**
 * Create a reactive stroke store with undo/redo history and scaling support.
 *
 * Designed to replace the non-reactive `createStrokeStore`.
 */
export function createReactiveStrokeStore(): StrokeStore {
	const history = makeReactiveArrayWithHistory<Stroke>();

	return {
		...history,
		addStroke(points: Point[]): Stroke {
			const now = performance.now();
			const stroke: Stroke = {
				id: `s${history.pushCount() + 1}`,
				points: points.map((point) => ({ ...point })),
				startedAt: points[0]?.t ?? now,
				endedAt: points[points.length - 1]?.t ?? now
			};
			history.push(stroke);
			return stroke;
		},

		scale(scaleX: number, scaleY: number): void {
			const strokes = history.get();
			for (let i = 0; i < strokes.length; i++) {
				strokes[i] = scaleStroke(strokes[i], scaleX, scaleY);
			}
		},

		getStrokes(): Stroke[] {
			return history.get();
		}
	};
}
