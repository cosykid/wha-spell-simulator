export function createStrokeStore() {
  let strokes = [];
  let nextId = 1;

  return {
    addStroke(points) {
      const now = performance.now();
      const stroke = {
        id: `s${nextId++}`,
        points: points.map((point) => ({ ...point })),
        startedAt: points[0]?.t ?? now,
        endedAt: points[points.length - 1]?.t ?? now
      };
      strokes = [...strokes, stroke];
      return stroke;
    },

    undo() {
      const removed = strokes[strokes.length - 1] ?? null;
      strokes = strokes.slice(0, -1);
      return removed;
    },

    clear() {
      strokes = [];
      nextId = 1;
    },

    scale(scaleX, scaleY) {
      strokes = strokes.map((stroke) => ({
        ...stroke,
        points: stroke.points.map((point) => ({
          ...point,
          x: point.x * scaleX,
          y: point.y * scaleY
        }))
      }));
    },

    getStrokes() {
      return strokes.map((stroke) => ({
        ...stroke,
        points: stroke.points.map((point) => ({ ...point }))
      }));
    },

    count() {
      return strokes.length;
    }
  };
}
