import type { Point, Stroke, StrokeStore } from '../types.js';

/**
 * A stroke store that also reports how many times it has been mutated.
 *
 * The render path caches per-frame work on that number, so it belongs to the
 * store rather than to a counter kept beside it.
 */
export interface VersionedStrokeStore extends StrokeStore {
	/** Rises on every mutation and never resets, so a cache key never repeats. */
	version(): number;
}

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

export function createStrokeStore(): VersionedStrokeStore {
	let strokes: Stroke[] = [];
	let redoStack: Stroke[] = [];
	let nextId = 1;
	// Counts mutations that replaced the stroke list. A no-op undo or redo leaves
	// it alone so a cached frame survives.
	let mutations = 0;

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
			mutations += 1;
			return stroke;
		},

		undo(): Stroke | null {
			const removed = strokes[strokes.length - 1] ?? null;
			if (removed) {
				strokes = strokes.slice(0, -1);
				redoStack = [...redoStack, removed];
				mutations += 1;
			}
			return removed;
		},

		redo(): Stroke | null {
			const restored = redoStack[redoStack.length - 1] ?? null;
			if (restored) {
				redoStack = redoStack.slice(0, -1);
				strokes = [...strokes, restored];
				mutations += 1;
			}
			return restored;
		},

		clear(): void {
			strokes = [];
			redoStack = [];
			nextId = 1;
			mutations += 1;
		},

		scale(scaleX: number, scaleY: number): void {
			strokes = strokes.map((stroke) => scaleStroke(stroke, scaleX, scaleY));
			redoStack = redoStack.map((stroke) => scaleStroke(stroke, scaleX, scaleY));
			mutations += 1;
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
			mutations += 1;
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
		},

		version(): number {
			return mutations;
		}
	};
}
