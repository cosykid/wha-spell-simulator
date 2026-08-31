import assert from 'node:assert/strict';
import test from 'node:test';

import { sealingStrokeId } from '../src/lib/ui/simulator/ring-seal.js';
import type { RingInfo, Stroke } from '../src/lib/types.js';

function stroke(id: string): Stroke {
	return { id, points: [{ x: 0, y: 0 }] };
}

function ring(overrides: Partial<RingInfo> = {}): RingInfo {
	return {
		found: true,
		complete: true,
		center: { x: 500, y: 500 },
		radius: 400,
		strokeIds: ['s1', 's3'],
		...overrides
	};
}

test('names the most recent stroke the ring runs through', () => {
	const strokes = [stroke('s1'), stroke('s2'), stroke('s3')];
	assert.equal(sealingStrokeId(strokes, ring()), 's3');
});

test('ignores symbol strokes drawn after the ring was seeded', () => {
	const strokes = [stroke('s1'), stroke('s2'), stroke('s3'), stroke('s4')];
	assert.equal(sealingStrokeId(strokes, ring({ strokeIds: ['s1', 's2'] })), 's2');
});

test('an open ring has no seal to take back', () => {
	const strokes = [stroke('s1'), stroke('s2')];
	assert.equal(sealingStrokeId(strokes, ring({ complete: false })), null);
	assert.equal(sealingStrokeId(strokes, ring({ found: false })), null);
	assert.equal(sealingStrokeId(strokes, null), null);
});

test('a ring closed by stamped ink alone names nothing', () => {
	// Baked placement strokes carry their placement id, so they never match a
	// freehand stroke in the store.
	const strokes = [stroke('s1')];
	assert.equal(sealingStrokeId(strokes, ring({ strokeIds: ['p1.0', 'p2.0'] })), null);
	assert.equal(sealingStrokeId(strokes, ring({ strokeIds: undefined })), null);
});
