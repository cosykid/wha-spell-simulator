import assert from 'node:assert/strict';
import test from 'node:test';

import { createStrokeStore } from '../src/lib/input/strokeStore.js';

test('scales redo history with active strokes', () => {
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

test('the version rises on every mutation', () => {
	const store = createStrokeStore();
	const start = store.version();

	store.addStroke([{ x: 1, y: 1, t: 1 }]);
	const afterAdd = store.version();
	assert.ok(afterAdd > start, 'addStroke should bump the version');

	store.undo();
	const afterUndo = store.version();
	assert.ok(afterUndo > afterAdd, 'undo should bump the version');

	store.redo();
	const afterRedo = store.version();
	assert.ok(afterRedo > afterUndo, 'redo should bump the version');

	// Erasing rewrites the store through load(), and so does a history restore.
	store.load([{ id: 's1', points: [{ x: 2, y: 2, t: 2 }], startedAt: 2, endedAt: 2 }]);
	const afterLoad = store.version();
	assert.ok(afterLoad > afterRedo, 'load should bump the version');

	store.scale(2, 2);
	const afterScale = store.version();
	assert.ok(afterScale > afterLoad, 'scale should bump the version');

	store.clear();
	assert.ok(store.version() > afterScale, 'clear should bump the version');
});

test('the version survives a clear, so a cache key never repeats', () => {
	const store = createStrokeStore();
	store.addStroke([{ x: 1, y: 1, t: 1 }]);
	const beforeClear = store.version();

	store.clear();
	store.addStroke([{ x: 1, y: 1, t: 1 }]);

	assert.ok(store.version() > beforeClear);
});

test('reads and no-op history moves leave the version alone', () => {
	const store = createStrokeStore();
	store.addStroke([{ x: 1, y: 1, t: 1 }]);
	const afterAdd = store.version();

	store.getStrokes();
	store.peekStrokes();
	store.count();
	store.canRedo();
	assert.equal(store.version(), afterAdd, 'reads must not bump the version');

	store.undo();
	const afterUndo = store.version();
	assert.equal(store.undo(), null);
	assert.equal(store.version(), afterUndo, 'an empty undo must not bump the version');

	store.redo();
	const afterRedo = store.version();
	assert.equal(store.redo(), null);
	assert.equal(store.version(), afterRedo, 'an empty redo must not bump the version');
});

test('peekStrokes hands the render path one array until the ink changes', () => {
	const store = createStrokeStore();
	store.addStroke([{ x: 1, y: 1, t: 1 }]);

	const first = store.peekStrokes();
	assert.equal(store.peekStrokes(), first, 'repeated peeks share one array');
	assert.equal(store.peekStrokes()[0], first[0], 'and one stroke object');

	store.addStroke([{ x: 2, y: 2, t: 2 }]);
	assert.notEqual(store.peekStrokes(), first, 'a mutation replaces the array');
});

test('getStrokes keeps its defensive copy for snapshots', () => {
	const store = createStrokeStore();
	store.addStroke([{ x: 1, y: 1, t: 1 }]);

	const live = store.peekStrokes();
	const copied = store.getStrokes();

	assert.notEqual(copied, live);
	assert.notEqual(copied[0], live[0]);
	assert.notEqual(copied[0].points[0], live[0].points[0]);
	assert.deepEqual(copied, live);
});
