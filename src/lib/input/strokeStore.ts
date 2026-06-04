import type { Point, Stroke, StrokeStore } from "../types.js";

export function createStrokeStore(): StrokeStore {
  let strokes: Stroke[] = [];
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
      return stroke;
    },

    undo(): Stroke | null {
      const removed = strokes[strokes.length - 1] ?? null;
      strokes = strokes.slice(0, -1);
      return removed;
    },

    clear(): void {
      strokes = [];
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
    }
  };
}
