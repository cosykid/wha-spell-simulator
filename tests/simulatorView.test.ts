import assert from 'node:assert/strict';
import test from 'node:test';

import {
	panAnchoredAtPointer,
	wheelDeltaPixels,
	zoomAfterWheel
} from '../src/lib/ui/simulator/pan-controller.svelte.js';

// The container is a shell-sized box carrying `translate(pan) scale(zoom)` about
// its own centre, so a canvas point sits this far from the box centre on screen.
function screenOffsetOf(localOffset: number, zoom: number, pan: number) {
	return localOffset * zoom + pan;
}

test('normalizes wheel deltas reported in lines and pages to pixels', () => {
	assert.equal(wheelDeltaPixels(120, 0), 120);
	assert.equal(wheelDeltaPixels(-42.5, 0), -42.5);
	assert.equal(wheelDeltaPixels(3, 1), 99);
	assert.equal(wheelDeltaPixels(1, 2), 400);
});

test('scrolling up magnifies and scrolling down shrinks, proportionally at any zoom', () => {
	assert.equal(zoomAfterWheel(1, 0), 1);
	assert.ok(zoomAfterWheel(1, -100) > 1);
	assert.ok(zoomAfterWheel(1, 100) < 1);

	// Exponential, so one notch is the same proportion at 0.5x as at 3x.
	const fromHalf = zoomAfterWheel(0.5, -100) / 0.5;
	const fromThree = zoomAfterWheel(3, -100) / 3;
	assert.ok(Math.abs(fromHalf - fromThree) < 1e-12);

	// A step and its opposite return to where they started.
	assert.ok(Math.abs(zoomAfterWheel(zoomAfterWheel(1.5, -80), 80) - 1.5) < 1e-12);
});

test('leaves the pan alone when the zoom does not change', () => {
	const pan = panAnchoredAtPointer({
		panX: 40,
		panY: -25,
		zoom: 1.5,
		nextZoom: 1.5,
		pointerX: 700,
		pointerY: 120,
		centerX: 512,
		centerY: 512
	});
	assert.ok(Math.abs(pan.panX - 40) < 1e-12);
	assert.ok(Math.abs(pan.panY + 25) < 1e-12);
});

test('keeps the canvas point under the pointer pinned across a zoom step', () => {
	const centerX = 512;
	const centerY = 512;
	const zoom = 1;
	const nextZoom = 2.5;
	const panX = 30;
	const panY = -18;

	// A point of the drawing, measured from the container's centre.
	const localX = 160;
	const localY = -90;
	const pointerX = centerX + screenOffsetOf(localX, zoom, panX);
	const pointerY = centerY + screenOffsetOf(localY, zoom, panY);

	const pan = panAnchoredAtPointer({
		panX,
		panY,
		zoom,
		nextZoom,
		pointerX,
		pointerY,
		centerX,
		centerY
	});

	assert.ok(Math.abs(centerX + screenOffsetOf(localX, nextZoom, pan.panX) - pointerX) < 1e-9);
	assert.ok(Math.abs(centerY + screenOffsetOf(localY, nextZoom, pan.panY) - pointerY) < 1e-9);
});

test('pins the point under the pointer when zooming back out too', () => {
	const centerX = 400;
	const centerY = 300;
	const zoom = 3;
	const nextZoom = 0.75;
	const panX = -120;
	const panY = 64;
	const localX = -55;
	const localY = 210;
	const pointerX = centerX + screenOffsetOf(localX, zoom, panX);
	const pointerY = centerY + screenOffsetOf(localY, zoom, panY);

	const pan = panAnchoredAtPointer({
		panX,
		panY,
		zoom,
		nextZoom,
		pointerX,
		pointerY,
		centerX,
		centerY
	});

	assert.ok(Math.abs(centerX + screenOffsetOf(localX, nextZoom, pan.panX) - pointerX) < 1e-9);
	assert.ok(Math.abs(centerY + screenOffsetOf(localY, nextZoom, pan.panY) - pointerY) < 1e-9);
});

test('scales an existing pan when the pointer sits at the box centre', () => {
	const pan = panAnchoredAtPointer({
		panX: 50,
		panY: 20,
		zoom: 1,
		nextZoom: 2,
		pointerX: 512,
		pointerY: 512,
		centerX: 512,
		centerY: 512
	});
	assert.ok(Math.abs(pan.panX - 100) < 1e-12);
	assert.ok(Math.abs(pan.panY - 40) < 1e-12);
});
