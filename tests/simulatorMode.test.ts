import assert from 'node:assert/strict';
import test from 'node:test';

import {
	locksFreehandInput,
	panEnabledForMode,
	togglePanMode,
	toggleToolMode,
	toolForMode
} from '../src/lib/ui/simulator/mode.js';

test('derives active tool and pan state from the canvas mode', () => {
	assert.equal(toolForMode('draw'), 'draw');
	assert.equal(toolForMode('arrange'), 'arrange');
	assert.equal(toolForMode('erase'), 'erase');
	assert.equal(toolForMode('pan'), 'draw');
	assert.equal(panEnabledForMode('pan'), true);
	assert.equal(panEnabledForMode('arrange'), false);
});

test('toggles mutually exclusive tool and pan modes', () => {
	assert.equal(toggleToolMode('draw', 'arrange'), 'arrange');
	assert.equal(toggleToolMode('arrange', 'arrange'), 'draw');
	assert.equal(toggleToolMode('pan', 'erase'), 'erase');
	assert.equal(togglePanMode('draw'), 'pan');
	assert.equal(togglePanMode('arrange'), 'pan');
	assert.equal(togglePanMode('pan'), 'draw');
});

test('locks freehand input outside draw mode or when the canvas is sealed', () => {
	assert.equal(locksFreehandInput('draw', false), false);
	assert.equal(locksFreehandInput('draw', true), true);
	assert.equal(locksFreehandInput('arrange', false), true);
	assert.equal(locksFreehandInput('erase', false), true);
	assert.equal(locksFreehandInput('pan', false), true);
});
