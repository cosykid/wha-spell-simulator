import assert from 'node:assert/strict';
import test from 'node:test';

import { InkMask } from '../src/lib/parser/inkMask.js';

// The grid is a flat row-major Uint8Array.
const at = (mask: InkMask, x: number, y: number) => mask.data[y * mask.size + x];

test('a new mask is empty and correctly sized', () => {
	const mask = new InkMask(10);
	assert.equal(mask.data.length, 100);
	assert.equal(mask.count(), 0);
});

test('markPoint stamps a radius-1 plus at the mapped pixel', () => {
	const mask = new InkMask(11);
	mask.markPoint(0.5, 0.5); // maps to centre pixel (5,5)
	// radius 1 keeps offsets where ox^2+oy^2 <= 1 → centre + 4-neighbours, not diagonals
	assert.equal(at(mask, 5, 5), 1);
	assert.equal(at(mask, 4, 5), 1);
	assert.equal(at(mask, 6, 5), 1);
	assert.equal(at(mask, 5, 4), 1);
	assert.equal(at(mask, 5, 6), 1);
	assert.equal(at(mask, 4, 4), 0); // diagonal excluded
	assert.equal(mask.count(), 5);
});

test('markPoint clamps out-of-range coordinates into the grid', () => {
	const mask = new InkMask(10);
	mask.markPoint(2, -1); // clamps to (1, 0) corner — must not throw or write OOB
	assert.ok(mask.count() > 0);
	assert.equal(mask.data.length, 100); // unchanged
});

test('drawSegment connects both endpoints', () => {
	const mask = new InkMask(20);
	mask.drawSegment({ x: 0, y: 0.5 }, { x: 1, y: 0.5 });
	assert.equal(at(mask, 0, Math.round(0.5 * 19)), 1); // left endpoint
	assert.equal(at(mask, 19, Math.round(0.5 * 19)), 1); // right endpoint
	assert.ok(mask.count() > 10); // a continuous line, not isolated dots
});

test('overlap counts shared pixels', () => {
	const a = new InkMask(11);
	const b = new InkMask(11);
	const c = new InkMask(11);
	a.markPoint(0.5, 0.5);
	b.markPoint(0.5, 0.5); // same stamp
	c.markPoint(0.1, 0.1); // disjoint stamp
	assert.equal(a.overlap(b), a.count()); // fully shared
	assert.equal(a.overlap(c), 0); // nothing in common
});

test('dice is 1 for identical masks, 0 for disjoint, 0 when either is empty', () => {
	const a = new InkMask(11);
	const b = new InkMask(11);
	const empty = new InkMask(11);
	a.markPoint(0.5, 0.5);
	b.markPoint(0.5, 0.5);
	assert.equal(a.dice(b), 1);
	a.markPoint(0.9, 0.9); // make them differ a bit
	assert.ok(a.dice(b) > 0 && a.dice(b) < 1);
	assert.equal(a.dice(empty), 0); // empty guard
	assert.equal(empty.dice(empty), 0);
});
