import assert from "node:assert/strict";
import test from "node:test";

import { createStrokeStore } from "../src/lib/input/strokeStore.js";

test("scales redo history with active strokes", () => {
  const store = createStrokeStore();

  store.addStroke([
    { x: 10, y: 20, t: 1 },
    { x: 30, y: 40, t: 2 }
  ]);

  assert.ok(store.undo());
  assert.equal(store.count(), 0);
  assert.equal(store.canRedo(), true);

  store.scale(2, 3);
  const restored = store.redo();

  assert.ok(restored);
  assert.deepEqual(restored.points, [
    { x: 20, y: 60, t: 1 },
    { x: 60, y: 120, t: 2 }
  ]);
  assert.deepEqual(store.getStrokes()[0]?.points, restored.points);
});
