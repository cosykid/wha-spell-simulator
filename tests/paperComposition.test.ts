import assert from 'node:assert/strict';
import test from 'node:test';

import {
	coverPlacement,
	paperCompositionKey,
	paperEntity,
	renderPaper,
	texturedPaperEntity
} from '../src/lib/ui/canvas/entities/paperEntity.js';

/** Minimal 2D context that records the paper's draw calls and gradient stops. */
function mockContext(width: number, height: number) {
	const calls: string[] = [];
	const stops: Array<[number, string]> = [];
	const gradient = {
		addColorStop(offset: number, color: string) {
			stops.push([offset, color]);
		}
	};
	const ctx = {
		canvas: { width, height },
		calls,
		stops,
		gradient,
		fillStyle: null as unknown,
		clearRect(x: number, y: number, w: number, h: number) {
			calls.push(`clearRect ${x},${y},${w},${h}`);
		},
		createLinearGradient(x0: number, y0: number, x1: number, y1: number) {
			calls.push(`createLinearGradient ${x0},${y0},${x1},${y1}`);
			return gradient;
		},
		fillRect(x: number, y: number, w: number, h: number) {
			calls.push(`fillRect ${x},${y},${w},${h}`);
		}
	};
	return ctx;
}

const PARCHMENT_STOPS: Array<[number, string]> = [
	[0, '#ece0bd'],
	[0.45, '#e7dab4'],
	[1, '#f0e5c6']
];

test('the flat paper clears, then fills a horizontal parchment gradient', () => {
	const ctx = mockContext(400, 300);

	renderPaper(ctx as unknown as CanvasRenderingContext2D);

	assert.deepEqual(ctx.calls, [
		'clearRect 0,0,400,300',
		'createLinearGradient 0,0,400,0',
		'fillRect 0,0,400,300'
	]);
	assert.deepEqual(ctx.stops, PARCHMENT_STOPS);
	assert.equal(ctx.fillStyle, ctx.gradient);
});

test('a paper entity falls back to the gradient when there is no DOM to compose on', () => {
	const flat = mockContext(200, 200);
	paperEntity().render(flat as unknown as CanvasRenderingContext2D, 0);
	assert.deepEqual(flat.stops, PARCHMENT_STOPS);

	// The textured entity must not reach for an Image either, or importing the
	// module anywhere without a DOM would throw.
	const textured = mockContext(200, 200);
	texturedPaperEntity('/images/background.jpg').render(
		textured as unknown as CanvasRenderingContext2D,
		0
	);
	assert.deepEqual(textured.calls, flat.calls);
	assert.deepEqual(textured.stops, PARCHMENT_STOPS);
});

test('a composition key changes with the backing store size and with the texture', () => {
	assert.equal(paperCompositionKey(900, 900, false), paperCompositionKey(900, 900, false));
	assert.notEqual(paperCompositionKey(900, 900, false), paperCompositionKey(901, 900, false));
	assert.notEqual(paperCompositionKey(900, 900, false), paperCompositionKey(900, 901, false));
	// The texture pops in on the first frame after it decodes, which is a
	// recomposition rather than a redraw.
	assert.notEqual(paperCompositionKey(900, 900, false), paperCompositionKey(900, 900, true));
});

test('a cover placement crops the overflowing axis evenly', () => {
	const wide = coverPlacement(100, 50, 200, 200);
	assert.deepEqual(wide, { x: -100, y: 0, width: 400, height: 200 });

	const tall = coverPlacement(50, 100, 200, 200);
	assert.deepEqual(tall, { x: 0, y: -100, width: 200, height: 400 });

	const exact = coverPlacement(100, 100, 300, 300);
	assert.deepEqual(exact, { x: 0, y: 0, width: 300, height: 300 });
});
