/**
 * @file R-01's charge beat, on the ink: the drawn seal igniting before it fires.
 *
 * "Ink brightens" is the charge's own content, so this runs on the cast's own
 * clock — from `activatedAt`, through the first beat, and gone by the strike,
 * where the stage takes the frame over. The beat window is
 * [`../cast/score/beats.ts`](../cast/score/beats.ts)'s, never a number restated
 * here, which is the whole of what the ink needs to know about the score.
 *
 * A warm front runs the strokes in the order they were drawn and leaves the
 * paper lit behind it, so the seal reads itself back before it speaks. Nothing
 * here reads a clock or a random: every value is a function of the timestamp it
 * is handed and the ink it is given.
 *
 * @example
 * drawSealIgnition(ctx, spellIR.activatedAt, sealStrokes, timestamp);
 */

import { BEAT_MS } from '../cast/score/beats.js';
import { clamp } from '../utils/geometry.js';
import type { Stroke } from '../types.js';

/**
 * Paper taking light, not a spell: amber behind, near-white at the front. The
 * charge runs this palette along the ink and
 * [`glyphOverlayRenderer.ts`](glyphOverlayRenderer.ts)'s glow holds it for the
 * rest of the cast, so a seal burns in one light rather than changing color at
 * the strike.
 */
export const SEAL_EMBER = {
	lit: { rgb: '255, 176, 94', glow: 'rgb(214, 128, 52)' },
	head: { rgb: '255, 233, 198', glow: 'rgb(255, 186, 108)' }
} as const;

const IGNITION = {
	/** Fraction of the charge the front takes to run the whole seal. */
	travel: 0.8,
	/** Fraction of the charge the warmth grows over before it hands off to the strike. */
	rise: 0.86,
	/** Share of the seal's ink the leading warmth spans. */
	headSpan: 0.18,
	/** Peak alphas. The layers composite additively, so nothing here is opaque. */
	alpha: { lit: 0.3, head: 0.58 },
	/** Canvas pixels, against ink drawn at about 4.4. */
	width: { lit: 5.4, head: 2.8 },
	blur: { lit: 9, head: 15 }
} as const;

/** One layer of warmth, over one span of the seal's ink. */
interface Ember {
	rgb: string;
	glow: string;
	alpha: number;
	width: number;
	blur: number;
	from: number;
	to: number;
}

function strokeLength(stroke: Stroke): number {
	let length = 0;
	for (let index = 1; index < stroke.points.length; index += 1) {
		const previous = stroke.points[index - 1];
		const point = stroke.points[index];
		length += Math.hypot(point.x - previous.x, point.y - previous.y);
	}
	return length;
}

/**
 * Adds the part of one stroke lying between two of its own arc lengths to the
 * current path. Contiguous, so a span crossing several segments is one line
 * rather than a row of overlapping caps.
 */
function tracePathBetween(
	ctx: CanvasRenderingContext2D,
	stroke: Stroke,
	fromLen: number,
	toLen: number
): void {
	let walked = 0;
	let started = false;
	for (let index = 1; index < stroke.points.length; index += 1) {
		const previous = stroke.points[index - 1];
		const point = stroke.points[index];
		const segment = Math.hypot(point.x - previous.x, point.y - previous.y);
		const enter = Math.max(fromLen - walked, 0);
		const leave = Math.min(toLen - walked, segment);
		walked += segment;
		if (segment <= 0 || leave <= enter) {
			continue;
		}
		const dx = (point.x - previous.x) / segment;
		const dy = (point.y - previous.y) / segment;
		if (!started) {
			ctx.moveTo(previous.x + dx * enter, previous.y + dy * enter);
			started = true;
		}
		ctx.lineTo(previous.x + dx * leave, previous.y + dy * leave);
	}
}

/** Paints one span of the seal, measured as arc length through the strokes in order. */
function paintEmber(ctx: CanvasRenderingContext2D, strokes: readonly Stroke[], ember: Ember): void {
	if (ember.to <= ember.from || ember.alpha <= 0) {
		return;
	}
	ctx.save();
	ctx.globalCompositeOperation = 'lighter';
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.strokeStyle = `rgba(${ember.rgb}, ${ember.alpha})`;
	ctx.lineWidth = ember.width;
	ctx.shadowBlur = ember.blur;
	ctx.shadowColor = ember.glow;
	ctx.beginPath();
	let walked = 0;
	for (const stroke of strokes) {
		tracePathBetween(ctx, stroke, ember.from - walked, ember.to - walked);
		walked += strokeLength(stroke);
	}
	ctx.stroke();
	ctx.restore();
}

/**
 * How lit the ink is, `0..1`, across the charge. It grows while the front runs
 * and is spent by the time the beat ends, so the strike is handed a cool seal
 * and the stage's own light is the next thing to arrive.
 */
function warmthAt(chargeT: number): number {
	if (chargeT < IGNITION.rise) {
		const rising = chargeT / IGNITION.rise;
		return rising * (2 - rising);
	}
	return 1 - (chargeT - IGNITION.rise) / (1 - IGNITION.rise);
}

/**
 * Draws the charge beat's warmth over `strokes`, which are the seal's own ink in
 * the order it was drawn. Outside the charge it draws nothing, so a caller may
 * hand it every frame of the cast.
 */
export function drawSealIgnition(
	ctx: CanvasRenderingContext2D,
	activatedAt: number | null | undefined,
	strokes: readonly Stroke[],
	timestamp: number
): void {
	if (!activatedAt || !strokes.length) {
		return;
	}
	const chargeT = (timestamp - activatedAt) / BEAT_MS.charge;
	if (chargeT < 0 || chargeT >= 1) {
		return;
	}

	let total = 0;
	for (const stroke of strokes) {
		total += strokeLength(stroke);
	}
	if (total <= 0) {
		return;
	}

	// The front eases along the whole seal and then waits at its end, so the last
	// stroke has time to be lit rather than being cut off by the strike.
	const run = clamp(chargeT / IGNITION.travel);
	const front = total * run * run * (3 - 2 * run);
	const warmth = warmthAt(chargeT);

	paintEmber(ctx, strokes, {
		...SEAL_EMBER.lit,
		alpha: IGNITION.alpha.lit * warmth,
		width: IGNITION.width.lit,
		blur: IGNITION.blur.lit,
		from: 0,
		to: front
	});
	paintEmber(ctx, strokes, {
		...SEAL_EMBER.head,
		// The front itself, brightest where the warmth has just arrived. It fades
		// out with everything else once it reaches the end of the ink.
		alpha: IGNITION.alpha.head * warmth * (1 - run),
		width: IGNITION.width.head,
		blur: IGNITION.blur.head,
		from: front - total * IGNITION.headSpan,
		to: front
	});
}
