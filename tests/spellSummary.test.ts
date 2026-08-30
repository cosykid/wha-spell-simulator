import assert from 'node:assert/strict';
import test from 'node:test';

import { GLYPH_WARNINGS } from '../src/lib/parser/glyphWarnings.js';
import { totalMsFor } from '../src/lib/cast/score/beats.js';
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

test('an open ring with no sigil asks for one instead of reporting an invalid spell', () => {
	const summary = computeSummary({
		store: storeWithCount(1),
		pipeline: { ring: { complete: false } } as ClassifiedDrawing,
		spellIR: {
			active: false,
			prepared: false,
			valid: false,
			status: 'Invalid spell',
			warnings: [GLYPH_WARNINGS.ringIncomplete, GLYPH_WARNINGS.missingPrimarySigil]
		} as SpellIR,
		showGuides: true
	});

	assert.equal(summary.statusText, 'Ring open - draw a sigil in the center');
	assert.equal(summary.statusClass, '');
});

test('an open ring with an unreadable sigil asks for a larger one', () => {
	const summary = computeSummary({
		store: storeWithCount(2),
		pipeline: { ring: { complete: false } } as ClassifiedDrawing,
		spellIR: {
			active: false,
			prepared: false,
			valid: false,
			status: 'Invalid spell',
			warnings: [GLYPH_WARNINGS.primarySigilConfidenceLow]
		} as SpellIR,
		showGuides: true
	});

	assert.equal(summary.statusText, 'Sigil unclear - try drawing it larger');
	assert.equal(summary.statusClass, '');
});

test('a contradictory open drawing keeps the compiler verdict and the invalid dot', () => {
	const summary = computeSummary({
		store: storeWithCount(4),
		pipeline: { ring: { found: true, complete: false } } as ClassifiedDrawing,
		spellIR: {
			active: false,
			prepared: false,
			valid: false,
			status: 'Ambiguous sigil',
			warnings: [GLYPH_WARNINGS.primarySigilAmbiguous]
		} as SpellIR,
		showGuides: true
	});

	assert.equal(summary.statusText, 'Ambiguous sigil');
	assert.equal(summary.statusClass, 'invalid');
});

test('a closed ring keeps its sealed verdict rather than an in-progress hint', () => {
	const summary = computeSummary({
		store: storeWithCount(4),
		pipeline: { ring: { complete: true } } as ClassifiedDrawing,
		spellIR: {
			active: false,
			prepared: false,
			valid: false,
			status: 'Invalid spell',
			warnings: [GLYPH_WARNINGS.missingPrimarySigil]
		} as SpellIR,
		showGuides: true
	});

	assert.equal(summary.statusText, 'Ring closed - no stable magic detected');
	assert.equal(summary.statusClass, 'closed');
});

test('a prepared spell keeps its status even when the parser warned about the drawing', () => {
	const summary = computeSummary({
		store: storeWithCount(3),
		pipeline: { ring: { complete: false } } as ClassifiedDrawing,
		spellIR: {
			active: false,
			prepared: true,
			valid: true,
			status: 'Prepared spell',
			warnings: [GLYPH_WARNINGS.ringIncomplete, GLYPH_WARNINGS.missingPrimarySigil]
		} as SpellIR,
		showGuides: true
	});

	assert.equal(summary.statusText, 'Prepared spell');
	assert.equal(summary.statusClass, 'prepared');
});

test('an empty canvas reports no ring detected without the invalid dot', () => {
	const summary = computeSummary({
		store: storeWithCount(0),
		pipeline: null,
		spellIR: null,
		showGuides: true
	});

	assert.equal(summary.statusText, 'No ring detected');
	assert.equal(summary.statusClass, '');
});

test('strokes with no ring yet stay neutral rather than invalid', () => {
	const summary = computeSummary({
		store: storeWithCount(2),
		pipeline: { ring: null } as ClassifiedDrawing,
		spellIR: {
			active: false,
			prepared: false,
			valid: false,
			status: 'No ring detected'
		} as SpellIR,
		showGuides: true
	});

	assert.equal(summary.statusText, 'No ring detected');
	assert.equal(summary.statusClass, '');
});

test('an active spell reports when its one-shot cast runs out', () => {
	const summary = computeSummary({
		store: storeWithCount(4),
		pipeline: { ring: { complete: true } } as ClassifiedDrawing,
		spellIR: {
			active: true,
			valid: true,
			status: 'Active spell',
			activatedAt: 1000,
			duration: 4
		} as SpellIR,
		showGuides: true
	});

	assert.equal(summary.castEndsAt, 1000 + totalMsFor(4));
});

test('a spell that is not casting has no cast end', () => {
	const summary = computeSummary({
		store: storeWithCount(3),
		pipeline: { ring: { complete: false } } as ClassifiedDrawing,
		spellIR: {
			active: false,
			prepared: true,
			valid: true,
			status: 'Prepared spell',
			activatedAt: null,
			duration: 4
		} as SpellIR,
		showGuides: true
	});

	assert.equal(summary.castEndsAt, null);
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
