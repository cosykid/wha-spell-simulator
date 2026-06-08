import type { Point, Stroke, StrokeStore } from '../types.js';

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

export function createStrokeStore(): StrokeStore {
	let strokes: Stroke[] = [];
	let redoStack: Stroke[] = [];
	let nextId = 1;

	return {
		addStroke(points: Point[]): Stroke {
			const now = performance.now();
			const stroke: Stroke = {
				id: `s${nextId++}`,
				points: points.map((point) => ({ ...point })),
				startedAt: points[0]?.t ?? now,
				endedAt: points[points.length - 1]?.t ?? now
			};
			strokes = [...strokes, stroke];
			redoStack = [];
			return stroke;
		},

		undo(): Stroke | null {
			const removed = strokes[strokes.length - 1] ?? null;
			if (removed) {
				strokes = strokes.slice(0, -1);
				redoStack = [...redoStack, removed];
			}
			return removed;
		},

		redo(): Stroke | null {
			const restored = redoStack[redoStack.length - 1] ?? null;
			if (restored) {
				redoStack = redoStack.slice(0, -1);
				strokes = [...strokes, restored];
			}
			return restored;
		},

		clear(): void {
			strokes = [];
			redoStack = [];
			nextId = 1;
		},

		scale(scaleX: number, scaleY: number): void {
			strokes = strokes.map((stroke) => scaleStroke(stroke, scaleX, scaleY));
			redoStack = redoStack.map((stroke) => scaleStroke(stroke, scaleX, scaleY));
		},

		load(loaded: Stroke[]): void {
			strokes = loaded.map((stroke) => ({
				...stroke,
				points: stroke.points.map((point) => ({ ...point }))
			}));
			redoStack = [];
			nextId = strokes.reduce((max, stroke) => {
				const match = /^s(\d+)$/.exec(stroke.id);
				return match ? Math.max(max, Number(match[1]) + 1) : max;
			}, 1);
		},

		getStrokes(): Stroke[] {
			return strokes.map((stroke) => ({
				...stroke,
				points: stroke.points.map((point) => ({ ...point }))
			}));
		},

		peekStrokes(): Stroke[] {
			return strokes;
		},

		count(): number {
			return strokes.length;
		},

		canRedo(): boolean {
			return redoStack.length > 0;
		}
	};
}
