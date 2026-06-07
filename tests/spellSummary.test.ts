import assert from 'node:assert/strict';
import test from 'node:test';

import { computeSummary } from '../src/lib/ui/spellSummary.js';
import type { ClassifiedDrawing, SpellIR, StrokeStore } from '../src/lib/types.js';

function storeWithCount(count: number, canRedo = false): StrokeStore {
	return {
		addStroke: () => {
			throw new Error('not needed');
		},
		undo: () => null,
		redo: () => null,
		clear: () => {},
		scale: () => {},
		getStrokes: () => [],
		peekStrokes: () => [],
		count: () => count,
		canRedo: () => canRedo
	};
}

test('disables undo and redo when a completed ring locks drawing input', () => {
	const summary = computeSummary({
		store: storeWithCount(3),
		pipeline: { ring: { complete: true } } as ClassifiedDrawing,
		spellIR: { active: true, valid: true, status: 'Active spell' } as SpellIR,
		showGuides: true
	});

	assert.equal(summary.inputLocked, true);
	assert.equal(summary.redoDisabled, true);
});

test('keeps undo disabled when there are no strokes', () => {
	const summary = computeSummary({
		store: storeWithCount(0),
		pipeline: { ring: { complete: true } } as ClassifiedDrawing,
		spellIR: { active: true, valid: true, status: 'Active spell' } as SpellIR,
		showGuides: true
	});

	assert.equal(summary.inputLocked, true);
	assert.equal(summary.redoDisabled, true);
});

test('enables redo when undone strokes are available and no spell is active', () => {
	const summary = computeSummary({
		store: storeWithCount(1, true),
		pipeline: { ring: { complete: false } } as ClassifiedDrawing,
		spellIR: { active: false, valid: true, status: 'Drawing' } as SpellIR,
		showGuides: true
	});

	assert.equal(summary.redoDisabled, false);
});

test('disables redo when there is nothing to redo', () => {
	const summary = computeSummary({
		store: storeWithCount(1, false),
		pipeline: { ring: { complete: false } } as ClassifiedDrawing,
		spellIR: { active: false, valid: true, status: 'Drawing' } as SpellIR,
		showGuides: true
	});

	assert.equal(summary.redoDisabled, true);
});

test('disables redo while a spell is active even if redo history exists', () => {
	const summary = computeSummary({
		store: storeWithCount(3, true),
		pipeline: { ring: { complete: true } } as ClassifiedDrawing,
		spellIR: { active: true, valid: true, status: 'Active spell' } as SpellIR,
		showGuides: true
	});

	assert.equal(summary.redoDisabled, true);
});
