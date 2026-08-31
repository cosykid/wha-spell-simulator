import assert from 'node:assert/strict';
import test from 'node:test';

import { eraserCursorCss } from '../src/lib/ui/simulator/eraserCursor.js';

/** A glyph canvas with a 1000px backing store drawn at `onScreenWidth`. */
function glyphCanvas(onScreenWidth: number): HTMLCanvasElement {
	return {
		width: 1000,
		getBoundingClientRect: () => ({ left: 0, top: 0, width: onScreenWidth, height: onScreenWidth })
	} as unknown as HTMLCanvasElement;
}

/** Reads the ring radius back out of the cursor's SVG data URL. */
function ringRadius(cursor: string): number {
	return Number(/r="([\d.]+)"/.exec(decodeURIComponent(cursor))?.[1]);
}

test('scales the ring by how large the canvas is drawn', () => {
	// A 1000px backing store drawn 500px wide halves the brush footprint. Zoom and
	// the portal tilt both reach the cursor through this one measurement.
	assert.equal(ringRadius(eraserCursorCss(glyphCanvas(500), 30)), 15);
	assert.equal(ringRadius(eraserCursorCss(glyphCanvas(1000), 30)), 30);
	assert.equal(ringRadius(eraserCursorCss(glyphCanvas(2000), 30)), 60);
});

test('keeps the ring visible when the brush shrinks to nothing', () => {
	assert.equal(ringRadius(eraserCursorCss(glyphCanvas(50), 30)), 4);
});

test('falls back to the unscaled radius while the canvas has no box', () => {
	assert.equal(ringRadius(eraserCursorCss(glyphCanvas(0), 30)), 30);
});

test('centers the cursor hotspot on the ring', () => {
	const cursor = eraserCursorCss(glyphCanvas(500), 30);
	const svgWidth = Number(/width="(\d+)"/.exec(decodeURIComponent(cursor))?.[1]);
	const hotspot = /\) ([\d.]+) ([\d.]+), crosshair$/.exec(cursor);

	assert.equal(Number(hotspot?.[1]), svgWidth / 2);
	assert.equal(Number(hotspot?.[2]), svgWidth / 2);
});
