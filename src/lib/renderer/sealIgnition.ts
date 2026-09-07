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
import { inkRibbonFor, traceInkRibbon } from '../ui/canvas/entities/inkRibbon.js';
import { INK_NOMINAL_WIDTH } from '../ui/canvas/entities/strokeEntity.js';
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
	/**
	 * Canvas pixels at the ink's nominal weight, so the lit span sits a hair
	 * proud of the mark and the head burns inside it. The ink's real width
	 * moves with the hand, and these are carried as ratios of it, so the front
	 * narrows into a tapered tail rather than overhanging it.
	 */
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

/** Paints one span of the seal, measured as arc length through the strokes in order. */
function paintEmber(
	ctx: CanvasRenderingContext2D,
	strokes: readonly Stroke[],
	inkWidth: number,
	ember: Ember
): void {
	if (ember.to <= ember.from || ember.alpha <= 0) {
		return;
	}
	ctx.save();
	ctx.globalCompositeOperation = 'lighter';
	ctx.fillStyle = `rgba(${ember.rgb}, ${ember.alpha})`;
	ctx.shadowBlur = ember.blur;
	ctx.shadowColor = ember.glow;
	ctx.beginPath();
	let walked = 0;
	for (const stroke of strokes) {
		const ribbon = inkRibbonFor(stroke.points, inkWidth);
		if (!ribbon) {
			continue;
		}
		traceInkRibbon(ctx, ribbon, {
			scale: ember.width / INK_NOMINAL_WIDTH,
			from: ember.from - walked,
			to: ember.to - walked
		});
		walked += ribbon.length;
	}
	ctx.fill();
	ctx.restore();
}

/** How far the front has to travel to cross the whole seal, in the order it was drawn. */
function sealLength(strokes: readonly Stroke[], inkWidth: number): number {
	let total = 0;
	for (const stroke of strokes) {
		total += inkRibbonFor(stroke.points, inkWidth)?.length ?? 0;
	}
	return total;
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
	timestamp: number,
	inkWidth: number = INK_NOMINAL_WIDTH
): void {
	if (!activatedAt || !strokes.length) {
		return;
	}
	const chargeT = (timestamp - activatedAt) / BEAT_MS.charge;
	if (chargeT < 0 || chargeT >= 1) {
		return;
	}

	// Measured through the marks rather than their chords, because that is what
	// the front is painted along.
	const total = sealLength(strokes, inkWidth);
	if (total <= 0) {
		return;
	}

	// The front eases along the whole seal and then waits at its end, so the last
	// stroke has time to be lit rather than being cut off by the strike.
	const run = clamp(chargeT / IGNITION.travel);
	const front = total * run * run * (3 - 2 * run);
	const warmth = warmthAt(chargeT);

	paintEmber(ctx, strokes, inkWidth, {
		...SEAL_EMBER.lit,
		alpha: IGNITION.alpha.lit * warmth,
		width: IGNITION.width.lit,
		blur: IGNITION.blur.lit,
		from: 0,
		to: front
	});
	paintEmber(ctx, strokes, inkWidth, {
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
