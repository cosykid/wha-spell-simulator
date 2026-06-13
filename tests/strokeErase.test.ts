import assert from 'node:assert/strict';
import test from 'node:test';

import { eraseSegment } from '../src/lib/utils/strokeErase.js';
import type { Stroke } from '../src/lib/types.js';

const OPTIONS = { radius: 10, minRemnantLength: 7 };

function stroke(id: string, xs: number[], y = 0): Stroke {
	return { id, points: xs.map((x) => ({ x, y })) };
}

function range(from: number, to: number, step: number): number[] {
	const values: number[] = [];
	for (let value = from; value <= to; value += step) {
		values.push(value);
	}
	return values;
}

test('a dab through the middle splits a stroke in two', () => {
	const result = eraseSegment(
		[stroke('s1', range(0, 100, 5))],
		{ x: 50, y: 0 },
		{ x: 50, y: 0 },
		OPTIONS
	);

	assert.equal(result.changed, true);
	assert.equal(result.strokes.length, 2);
	assert.deepEqual(
		result.strokes.map((s) => s.id),
		['s1/1', 's1/2']
	);
	// Points within the 10px radius of x=50 (40..60) are gone.
	assert.equal(result.strokes[0].points.at(-1)?.x, 35);
	assert.equal(result.strokes[1].points[0]?.x, 65);
});

test('erasing across an end trims the stroke to one survivor', () => {
	const result = eraseSegment(
		[stroke('s1', range(0, 100, 5))],
		{ x: 0, y: 0 },
		{ x: 0, y: 0 },
		OPTIONS
	);

	assert.equal(result.changed, true);
	assert.equal(result.strokes.length, 1);
	assert.equal(result.strokes[0].id, 's1/1');
	assert.equal(result.strokes[0].points[0]?.x, 15);
});

test('erasing everything removes the stroke entirely', () => {
	const result = eraseSegment(
		[stroke('s1', range(0, 100, 5))],
		{ x: 50, y: 0 },
		{ x: 50, y: 0 },
		{ radius: 200, minRemnantLength: 7 }
	);

	assert.equal(result.changed, true);
	assert.deepEqual(result.strokes, []);
});

test('a near miss leaves the stroke untouched (same object, changed=false)', () => {
	const original = stroke('s1', range(0, 100, 5));
	const result = eraseSegment([original], { x: 50, y: 30 }, { x: 50, y: 30 }, OPTIONS);

	assert.equal(result.changed, false);
	assert.equal(result.strokes.length, 1);
	assert.equal(result.strokes[0], original);
});

test('a remnant below the minimum length is dropped', () => {
	// 3-point stroke 0..10; erasing the right end leaves [0, 5], length 5 < 7.
	const result = eraseSegment(
		[stroke('s1', [0, 5, 10])],
		{ x: 10, y: 0 },
		{ x: 10, y: 0 },
		{ radius: 4, minRemnantLength: 7 }
	);

	assert.equal(result.changed, true);
	assert.deepEqual(result.strokes, []);
});

test('an eraser swipe crossing between sample points still cuts the stroke', () => {
	// Sparse stroke: both points x=30 and x=60 are 15px from the eraser path
	// (outside radius 5), but the connecting segment crosses it at x=45.
	const result = eraseSegment(
		[stroke('s1', [0, 30, 60, 90])],
		{ x: 45, y: -20 },
		{ x: 45, y: 20 },
		{ radius: 5, minRemnantLength: 7 }
	);

	assert.equal(result.changed, true);
	assert.equal(result.strokes.length, 2);
	assert.deepEqual(
		result.strokes[0].points.map((p) => p.x),
		[0, 30]
	);
	assert.deepEqual(
		result.strokes[1].points.map((p) => p.x),
		[60, 90]
	);
});
