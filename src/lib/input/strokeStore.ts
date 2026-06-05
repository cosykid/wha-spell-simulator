import type { Point, Stroke, StrokeStore } from "../types.js";

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
      redoStack = []; // new stroke clears redo history
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
      strokes = strokes.map((stroke) => ({
        ...stroke,
        points: stroke.points.map((point) => ({
          ...point,
          x: point.x * scaleX,
          y: point.y * scaleY
        }))
      }));
    },

    getStrokes(): Stroke[] {
      return strokes.map((stroke) => ({
        ...stroke,
        points: stroke.points.map((point) => ({ ...point }))
      }));
    },

    count(): number {
      return strokes.length;
    },

    canRedo(): boolean {
      return redoStack.length > 0;
    }
  };
}
