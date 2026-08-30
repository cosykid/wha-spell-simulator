import assert from 'node:assert/strict';
import test from 'node:test';

import { nudgeForArrowKey } from '../src/lib/ui/simulator/keyboard.js';
import { resizeCursorForDirection } from '../src/lib/ui/simulator/placement-behavior.svelte.js';

test('names a resize cursor from the handle direction, with canvas y pointing down', () => {
	assert.equal(resizeCursorForDirection(1, 0), 'ew-resize');
	assert.equal(resizeCursorForDirection(-1, 0), 'ew-resize');
	assert.equal(resizeCursorForDirection(0, 1), 'ns-resize');
	assert.equal(resizeCursorForDirection(0, -1), 'ns-resize');
	assert.equal(resizeCursorForDirection(1, 1), 'nwse-resize');
	assert.equal(resizeCursorForDirection(-1, -1), 'nwse-resize');
	assert.equal(resizeCursorForDirection(1, -1), 'nesw-resize');
	assert.equal(resizeCursorForDirection(-1, 1), 'nesw-resize');
});

test('follows a rotated placement, so its cursors match the way it sits', () => {
	// The right-hand elongate handle of a shape turned a quarter turn now points
	// down the screen, and its cursor turns with it.
	assert.equal(resizeCursorForDirection(0.001, 120), 'ns-resize');
	// A corner handle a hair off the axis still reads as that axis, not a diagonal.
	assert.equal(resizeCursorForDirection(200, 8), 'ew-resize');
});

test('nudges by one canvas pixel per arrow, ten with shift held', () => {
	assert.deepEqual(nudgeForArrowKey('ArrowLeft', false), { x: -1, y: 0 });
	assert.deepEqual(nudgeForArrowKey('ArrowRight', false), { x: 1, y: 0 });
	assert.deepEqual(nudgeForArrowKey('ArrowUp', false), { x: 0, y: -1 });
	assert.deepEqual(nudgeForArrowKey('ArrowDown', false), { x: 0, y: 1 });
	assert.deepEqual(nudgeForArrowKey('ArrowDown', true), { x: 0, y: 10 });
	assert.deepEqual(nudgeForArrowKey('ArrowLeft', true), { x: -10, y: 0 });
});

test('ignores keys that are not arrows', () => {
	assert.equal(nudgeForArrowKey('Enter', false), null);
	assert.equal(nudgeForArrowKey('a', true), null);
	assert.equal(nudgeForArrowKey('', false), null);
});
