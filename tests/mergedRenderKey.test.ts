import assert from 'node:assert/strict';
import test from 'node:test';

import { createStrokeStore } from '../src/lib/input/strokeStore.js';
import { mergedRenderKey, placementBakeKey } from '../src/lib/ui/simulator/drawing-state.svelte.js';
import type { Placement } from '../src/lib/types.js';

function placement(id: string, patch: Partial<Placement['transform']> = {}): Placement {
	return {
		id,
		kind: 'sigil',
		sourceId: 'fire',
		baseStrokes: [
			[
				{ x: 0, y: 0, t: 0 },
				{ x: 1, y: 1, t: 1 }
			]
		],
		transform: { cx: 10, cy: 20, scaleX: 1, scaleY: 1, rotationDeg: 0, ...patch }
	};
}

test('a bake key moves only when the baked geometry would', () => {
	const first = placement('p1');

	assert.equal(placementBakeKey(first), placementBakeKey(placement('p1')));
	assert.equal(placementBakeKey(first), placementBakeKey(placement('p2')), 'id is not geometry');
	assert.notEqual(placementBakeKey(first), placementBakeKey(placement('p1', { cx: 11 })));
	assert.notEqual(placementBakeKey(first), placementBakeKey(placement('p1', { scaleY: 2 })));
	assert.notEqual(placementBakeKey(first), placementBakeKey(placement('p1', { rotationDeg: 90 })));
});

test('the merged render key holds still while nothing is drawn or moved', () => {
	const store = createStrokeStore();
	store.addStroke([{ x: 1, y: 1, t: 1 }]);
	const placements = [placement('p1')];

	const key = mergedRenderKey(store.version(), placements);
	assert.equal(mergedRenderKey(store.version(), placements), key);
	// Reading the store is what every frame does, and it must not move the key.
	store.peekStrokes();
	assert.equal(mergedRenderKey(store.version(), placements), key);
});

test('the merged render key moves when the stroke store is mutated', () => {
	const store = createStrokeStore();
	const placements = [placement('p1')];
	const before = mergedRenderKey(store.version(), placements);

	store.addStroke([{ x: 1, y: 1, t: 1 }]);
	const afterDraw = mergedRenderKey(store.version(), placements);
	assert.notEqual(afterDraw, before);

	// The eraser rewrites the store through load().
	store.load([]);
	assert.notEqual(mergedRenderKey(store.version(), placements), afterDraw);
});

test('the merged render key moves when a placement is added, moved, or removed', () => {
	const store = createStrokeStore();
	const one = placement('p1');
	const single = mergedRenderKey(store.version(), [one]);

	assert.notEqual(mergedRenderKey(store.version(), [one, placement('p2')]), single);
	assert.notEqual(mergedRenderKey(store.version(), [placement('p1', { cx: 11 })]), single);
	assert.notEqual(mergedRenderKey(store.version(), []), single);
});

test('the merged render key tells two identical placements apart', () => {
	// Baked strokes carry their placement id, so swapping one placement for an
	// identically shaped one has to rebuild the merged array.
	const store = createStrokeStore();

	assert.notEqual(
		mergedRenderKey(store.version(), [placement('p1')]),
		mergedRenderKey(store.version(), [placement('p2')])
	);
});
