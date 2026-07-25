import assert from 'node:assert/strict';
import test from 'node:test';

import { fitStrokesToPreviewPolylines } from '../src/lib/ui/strokePreview.js';

/** Parses polyline points strings back into numbers for bounds assertions. */
function bounds(polylines: string[]) {
	const points = polylines
		.flatMap((polyline) => polyline.split(' '))
		.map((pair) => pair.split(',').map(Number));
	const xs = points.map(([x]) => x);
	const ys = points.map(([, y]) => y);
	return {
		minX: Math.min(...xs),
		maxX: Math.max(...xs),
		minY: Math.min(...ys),
		maxY: Math.max(...ys)
	};
}

test('fits a drawing made in one corner of its canvas to the whole frame', () => {
	const square = [
		{ x: 0.05, y: 0.05 },
		{ x: 0.25, y: 0.05 },
		{ x: 0.25, y: 0.25 },
		{ x: 0.05, y: 0.25 },
		{ x: 0.05, y: 0.05 }
	];
	assert.deepEqual(bounds(fitStrokesToPreviewPolylines([square])), {
		minX: 9,
		maxX: 91,
		minY: 9,
		maxY: 91
	});
});

test('scales both axes alike so a tall glyph keeps its proportions', () => {
	const tall = [
		{ x: 0, y: 0 },
		{ x: 20, y: 80 }
	];
	const box = bounds(fitStrokesToPreviewPolylines([tall]));
	assert.equal(box.maxY - box.minY, 82);
	assert.ok(Math.abs(box.maxX - box.minX - 20.5) < 0.15);
	assert.ok(Math.abs((box.minX + box.maxX) / 2 - 50) < 0.15);
});

test('centers a degenerate drawing instead of scaling it to infinity', () => {
	const dot = [
		{ x: 3, y: 3 },
		{ x: 3, y: 3 }
	];
	assert.deepEqual(fitStrokesToPreviewPolylines([dot]), ['50,50 50,50']);
});

test('drops non-finite points and empty strokes', () => {
	const strokes = [
		[],
		[{ x: Number.NaN, y: 0 }],
		[
			{ x: 0, y: 0 },
			{ x: Number.POSITIVE_INFINITY, y: 1 },
			{ x: 1, y: 1 }
		]
	];
	assert.deepEqual(fitStrokesToPreviewPolylines(strokes), ['9,9 91,91']);
});

test('returns nothing when there is nothing to draw', () => {
	assert.deepEqual(fitStrokesToPreviewPolylines(undefined), []);
	assert.deepEqual(fitStrokesToPreviewPolylines([[]]), []);
});
