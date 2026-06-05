import assert from 'node:assert/strict';
import test from 'node:test';

import { computeSummary } from '../src/lib/ui/spellSummary.js';
import type { ClassifiedDrawing, SpellIR, StrokeStore } from '../src/lib/types.js';

function storeWithCount(count: number): StrokeStore {
	return {
		addStroke: () => {
			throw new Error('not needed');
		},
		undo: () => null,
		redo: () => null,
		clear: () => {},
		scale: () => {},
		getStrokes: () => [],
		count: () => count,
		canRedo: () => false
	};
}

test('keeps undo enabled when a completed ring locks drawing input', () => {
	const summary = computeSummary({
		store: storeWithCount(3),
		pipeline: { ring: { complete: true } } as ClassifiedDrawing,
		spellIR: { active: true, valid: true, status: 'Active spell' } as SpellIR,
		showGuides: true
	});

	assert.equal(summary.inputLocked, true);
	assert.equal(summary.undoDisabled, false);
});

test('keeps undo disabled when there are no strokes', () => {
	const summary = computeSummary({
		store: storeWithCount(0),
		pipeline: { ring: { complete: true } } as ClassifiedDrawing,
		spellIR: { active: true, valid: true, status: 'Active spell' } as SpellIR,
		showGuides: true
	});

	assert.equal(summary.inputLocked, true);
	assert.equal(summary.undoDisabled, true);
});
