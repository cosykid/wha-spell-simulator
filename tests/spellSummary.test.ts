import assert from 'node:assert/strict';
import test from 'node:test';

import { computeSummary, meterPips } from '../src/lib/ui/spellSummary.js';
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
		load: () => {},
		getStrokes: () => [],
		peekStrokes: () => [],
		count: () => count,
		canRedo: () => canRedo
	};
}

test('keeps undo available and disables redo when a completed ring locks drawing input', () => {
	const summary = computeSummary({
		store: storeWithCount(3),
		pipeline: { ring: { complete: true } } as ClassifiedDrawing,
		spellIR: { active: true, valid: true, status: 'Active spell' } as SpellIR,
		showGuides: true
	});

	assert.equal(summary.inputLocked, true);
	assert.equal(summary.undoDisabled, false);
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
	assert.equal(summary.undoDisabled, true);
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

test('keeps the canvas hint hidden after drawing has started even if the canvas is empty', () => {
	const summary = computeSummary({
		store: storeWithCount(0),
		pipeline: { ring: { complete: false } } as ClassifiedDrawing,
		spellIR: { active: false, valid: true, status: 'No ring detected' } as SpellIR,
		showGuides: true,
		hintDismissed: true
	});

	assert.equal(summary.hintHidden, true);
});

test('erase mode locks freehand input without sealing the canvas', () => {
	const summary = computeSummary({
		store: storeWithCount(0),
		pipeline: { ring: { complete: false } } as ClassifiedDrawing,
		spellIR: null,
		showGuides: true,
		eraseMode: true
	});
	assert.equal(summary.inputLocked, true);
	assert.equal(summary.canvasLocked, false);
});

test('overrides the status line while recognition is reading the drawing', () => {
	const summary = computeSummary({
		store: storeWithCount(3),
		pipeline: { ring: { complete: false } } as ClassifiedDrawing,
		spellIR: { active: false, valid: true, status: 'No ring detected' } as SpellIR,
		showGuides: true,
		recognizing: true
	});

	assert.equal(summary.statusText, 'Reading the seal…');
	assert.equal(summary.statusClass, 'reading');
});

test('keeps locks and meters from the last result while reading', () => {
	const summary = computeSummary({
		store: storeWithCount(3),
		pipeline: { ring: { complete: true } } as ClassifiedDrawing,
		spellIR: { active: true, valid: true, status: 'Active spell', quality: 0.8 } as SpellIR,
		showGuides: true,
		recognizing: true
	});

	assert.equal(summary.statusText, 'Reading the seal…');
	assert.equal(summary.inputLocked, true);
	assert.equal(summary.canvasLocked, true);
	assert.equal(summary.quality, 0.8);
});

test('shows the reading state for placement-only drawings', () => {
	const summary = computeSummary({
		store: storeWithCount(0),
		pipeline: null,
		spellIR: null,
		showGuides: true,
		placementCount: 2,
		recognizing: true
	});

	assert.equal(summary.statusText, 'Reading the seal…');
});

test('skips the reading state when the canvas has no ink to read', () => {
	const summary = computeSummary({
		store: storeWithCount(0),
		pipeline: { ring: { complete: false } } as ClassifiedDrawing,
		spellIR: { active: false, valid: true, status: 'No ring detected' } as SpellIR,
		showGuides: true,
		recognizing: true
	});

	assert.equal(summary.statusText, 'No ring detected');
	assert.equal(summary.statusClass, '');
});

test('meterPips fills pips proportionally and rounds to the nearest pip', () => {
	assert.equal(meterPips(0, 10), 0);
	assert.equal(meterPips(1, 10), 10);
	assert.equal(meterPips(0.55, 10), 6);
	assert.equal(meterPips(0.62, 8), 5);
});

test('meterPips clamps out-of-range and nullish values', () => {
	assert.equal(meterPips(null, 10), 0);
	assert.equal(meterPips(undefined, 10), 0);
	assert.equal(meterPips(-0.5, 10), 0);
	assert.equal(meterPips(1.4, 10), 10);
});
