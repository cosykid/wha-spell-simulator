/**
 * @file The paper stand-in: cream stock with a plain ink ring, drawn flat and
 * tilted by the page's CSS with the portal's own numbers.
 *
 * It is deliberately not the app's glyph overlay. The bake-off needs the pigment
 * judged against a page, not against a finished seal, so this draws the least
 * that still gives the eye a ground plane and a horizon.
 */

import { mulberry32 } from '$lib/cast/rng.js';
import { PAPER, RING_INK } from './palette.js';

/** A hand-inked circle: several passes, each wobbling on its own. */
function inkRing(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	radius: number,
	rng: () => number
): void {
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	for (let pass = 0; pass < 3; pass += 1) {
		const wobble = 0.006 + rng() * 0.007;
		const phase = rng() * Math.PI * 2;
		ctx.strokeStyle = RING_INK;
		ctx.globalAlpha = pass === 0 ? 0.9 : 0.32;
		ctx.lineWidth = radius * (pass === 0 ? 0.016 : 0.009);
		ctx.beginPath();
		for (let i = 0; i <= 200; i += 1) {
			const angle = (i / 200) * Math.PI * 2;
			const r = radius * (1 + wobble * Math.sin(angle * 3 + phase) * Math.sin(angle * 7 + phase));
			const x = cx + Math.cos(angle) * r;
			const y = cy + Math.sin(angle) * r;
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
}

/** Where the seal sits on the canvas. `hybridStage` owns the numbers. */
export interface PlateRing {
	centerY: number;
	radius: number;
}

/**
 * Repaints the plate at the canvas's current size.
 *
 * @example
 * drawPaperPlate(paperCanvas, RING);
 */
export function drawPaperPlate(canvas: HTMLCanvasElement, ring: PlateRing): void {
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		return;
	}
	const { width, height } = canvas;
	const rng = mulberry32(0x9a9e2);

	ctx.clearRect(0, 0, width, height);
	ctx.fillStyle = PAPER;
	ctx.fillRect(0, 0, width, height);

	// Tooth, so the stock does not read as a flat swatch. Sparse and faint on
	// purpose: the shader carries the grain the pigment sits in, and two grains
	// stacked read as static rather than as paper.
	for (let i = 0; i < 1300; i += 1) {
		ctx.fillStyle = rng() < 0.6 ? 'rgba(126,100,60,0.035)' : 'rgba(255,250,228,0.05)';
		ctx.fillRect(rng() * width, rng() * height, 3, 3);
	}

	// A warm bloom under the seal, so the stock is not evenly lit.
	const bloom = ctx.createRadialGradient(
		width / 2,
		height * ring.centerY,
		0,
		width / 2,
		height * ring.centerY,
		Math.max(width, height) * 0.62
	);
	bloom.addColorStop(0, 'rgba(255,248,222,0.34)');
	bloom.addColorStop(0.55, 'rgba(214,186,132,0.1)');
	bloom.addColorStop(1, 'rgba(150,116,66,0.22)');
	ctx.fillStyle = bloom;
	ctx.fillRect(0, 0, width, height);

	inkRing(ctx, width / 2, height * ring.centerY, Math.min(width, height) * ring.radius, rng);
}
