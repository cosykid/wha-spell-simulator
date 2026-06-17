import assert from 'node:assert/strict';
import test from 'node:test';

import { drawCandidateDebug } from '../src/lib/renderer/glyphOverlayRenderer.js';
import type { Recognition, SymbolCandidate } from '../src/lib/types.js';

/** Minimal 2D context that records the text the overlay draws. */
function mockContext() {
	const texts: string[] = [];
	const ctx = {
		texts,
		lineWidth: 0,
		strokeStyle: '',
		fillStyle: '',
		save() {},
		restore() {},
		strokeRect() {},
		fillText(label: string) {
			texts.push(label);
		}
	};
	return ctx;
}

function candidate(sizeNorm: number): SymbolCandidate {
	return {
		candidateId: 'c1',
		bounds: { minX: 10, minY: 40, maxX: 50, maxY: 80, width: 40, height: 40 },
		sizeNorm
	} as unknown as SymbolCandidate;
}

function recognizedSigil(referenceSizeNorm: number | null): Recognition {
	return {
		candidateId: 'c1',
		recognized: true,
		kind: 'sigil',
		id: 'fire',
		confidence: 0.88,
		referenceSizeNorm,
		diagnostics: {
			topMatches: [{ kind: 'sigil', id: 'fire', confidence: 0.88, source: 'template' }]
		}
	} as unknown as Recognition;
}

test('overlay shows a recognized sigil size as ×ratio with a strength tag', () => {
	const ctx = mockContext();
	// sizeNorm 0.4 against referenceSizeNorm 0.2 => ratio 2.0 => strong.
	drawCandidateDebug(
		ctx as unknown as CanvasRenderingContext2D,
		[candidate(0.4)],
		[recognizedSigil(0.2)]
	);
	assert.ok(
		ctx.texts.includes('×2.00 strong'),
		`expected a size label, got ${JSON.stringify(ctx.texts)}`
	);
});

test('overlay falls back to the default referenceSizeNorm and tags weak/regular', () => {
	const ctx = mockContext();
	// No per-sigil reference; default 0.4, sizeNorm 0.3 => ratio 0.75 => weak.
	drawCandidateDebug(
		ctx as unknown as CanvasRenderingContext2D,
		[candidate(0.3)],
		[recognizedSigil(null)],
		{ defaultReferenceSizeNorm: 0.4 }
	);
	assert.ok(
		ctx.texts.includes('×0.75 weak'),
		`expected a weak size label, got ${JSON.stringify(ctx.texts)}`
	);
});

test('overlay shows the size label for recognized signs too', () => {
	const ctx = mockContext();
	// sizeNorm 0.2 against a sign referenceSizeNorm 0.16 => ratio 1.25 => regular (boundary).
	const sign = {
		...recognizedSigil(0.16),
		kind: 'sign',
		id: 'column'
	} as unknown as Recognition;
	drawCandidateDebug(ctx as unknown as CanvasRenderingContext2D, [candidate(0.2)], [sign]);
	assert.ok(
		ctx.texts.includes('×1.25 regular'),
		`expected a sign size label, got ${JSON.stringify(ctx.texts)}`
	);
});

test('overlay shows no size label for an unknown-kind candidate', () => {
	const ctx = mockContext();
	const unknown = {
		...recognizedSigil(0.2),
		kind: 'unknown',
		id: 'mystery'
	} as unknown as Recognition;
	drawCandidateDebug(ctx as unknown as CanvasRenderingContext2D, [candidate(0.4)], [unknown]);
	assert.ok(
		!ctx.texts.some((label) => label.startsWith('×')),
		`expected no size label, got ${JSON.stringify(ctx.texts)}`
	);
});
