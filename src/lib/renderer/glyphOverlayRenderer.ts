/**
 * @file What the glyph canvas draws over its own ink: the activated-ink glow and
 * the seal guides that report a spell's state before it casts.
 *
 * The guides used to live on the effect canvas. They are UI feedback rather than
 * spell behavior, so the redesign moved them here, onto the surface holding the
 * ink they annotate. Nothing here draws an active spell: that is `cast/`'s.
 *
 * The charge beat's own event, the ink taking light stroke by stroke, is one
 * concern over in [`sealIgnition.ts`](sealIgnition.ts). The glow below is what
 * that hands off to, and it burns in the same ember palette so the handoff is a
 * beat rather than a change of color.
 *
 * Recognition labels are one concern down in
 * [`glyphDebugOverlay.ts`](glyphDebugOverlay.ts).
 */

import { BEAT_MS } from '../cast/score/beats.js';
import { SEAL_EMBER } from './sealIgnition.js';
import type { RingInfo, SpellIR, Stroke } from '../types.js';

// ---------------------------------------------------------------------------
// Glow layer descriptors
// ---------------------------------------------------------------------------

interface GlowParams {
	pulse: number;
	flicker: number;
	glowAlpha: number;
}

interface GlowLayer {
	shadowColor: string;
	shadowBlur: (params: GlowParams) => number;
	strokeStyle: (params: GlowParams) => string;
	lineWidth: (params: GlowParams) => number;
}

// Two layers of one light: a broad amber spill on the paper, and a hot near-white
// core on the ink itself. Both take the charge beat's ember, so the warmth the
// ignition front leaves behind is the warmth that holds for the rest of the cast.
const GLOW_LAYERS: GlowLayer[] = [
	{
		shadowColor: SEAL_EMBER.lit.glow,
		shadowBlur: ({ pulse, flicker, glowAlpha }) => (24 + pulse * 18 + flicker * 10) * glowAlpha,
		strokeStyle: ({ pulse, glowAlpha }) =>
			`rgba(${SEAL_EMBER.lit.rgb}, ${(0.18 + pulse * 0.12) * glowAlpha})`,
		lineWidth: ({ pulse, glowAlpha }) => 4 + (8 + pulse * 2) * glowAlpha
	},
	{
		shadowColor: SEAL_EMBER.head.glow,
		shadowBlur: ({ pulse, glowAlpha }) => (10 + pulse * 6) * glowAlpha,
		strokeStyle: ({ pulse, glowAlpha }) =>
			`rgba(${SEAL_EMBER.head.rgb}, ${(0.88 + pulse * 0.12) * glowAlpha})`,
		lineWidth: ({ pulse, glowAlpha }) => 1.8 + (2 + pulse * 0.6) * glowAlpha
	}
];

// ---------------------------------------------------------------------------
// Stroke path helpers
// ---------------------------------------------------------------------------

function hasStrokePoints(stroke: Stroke | null | undefined): boolean {
	return Boolean(stroke?.points?.length);
}

function traceStrokePath(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
	const firstPoint = stroke.points[0];
	ctx.beginPath();
	ctx.moveTo(firstPoint.x, firstPoint.y);
	for (let index = 1; index < stroke.points.length; index += 1) {
		const point = stroke.points[index];
		ctx.lineTo(point.x, point.y);
	}
}

function drawGlowingStrokeLayer(
	ctx: CanvasRenderingContext2D,
	stroke: Stroke,
	glow: GlowParams,
	layer: GlowLayer
): void {
	ctx.save();
	ctx.globalCompositeOperation = 'lighter';
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.shadowBlur = layer.shadowBlur(glow);
	ctx.shadowColor = layer.shadowColor;
	ctx.strokeStyle = layer.strokeStyle(glow);
	ctx.lineWidth = layer.lineWidth(glow);
	traceStrokePath(ctx, stroke);
	ctx.stroke();
	ctx.restore();
}

function drawSingleGlowingStroke(
	ctx: CanvasRenderingContext2D,
	stroke: Stroke,
	timestamp: number,
	glowAlpha: number = 1
): void {
	if (!hasStrokePoints(stroke)) {
		return;
	}

	const glow: GlowParams = {
		pulse: 0.5 + Math.sin(timestamp * 0.004) * 0.5,
		// Deterministic on purpose: the look golden tier screenshots this layer, and
		// a random wobble makes every baseline a coin flip.
		flicker: 0.04 + Math.sin(timestamp * 0.037) * 0.04,
		glowAlpha
	};

	for (const layer of GLOW_LAYERS) {
		drawGlowingStrokeLayer(ctx, stroke, glow, layer);
	}
}

// ---------------------------------------------------------------------------
// Activated ink
// ---------------------------------------------------------------------------

function activeGlowStrokes(activatedStrokeIds: Set<string>, strokes: Stroke[]): Stroke[] {
	const glowingStrokes: Stroke[] = [];

	for (const stroke of strokes) {
		if (activatedStrokeIds.has(stroke.id)) {
			glowingStrokes.push(stroke);
		}
	}

	return glowingStrokes;
}

function glowAlphaAt(timestamp: number, activatedAt: number, duration: number): number {
	const elapsed = timestamp - activatedAt;
	if (elapsed < 0) {
		// Activation is still in the future; nothing has been sealed yet.
		return 0;
	}
	const t = Math.min(1, elapsed / duration);
	// R-01: the ink *brightens* through the charge rather than arriving already
	// lit, so the glow swells over that first beat and cools across the rest of
	// the cast. The swell is what the ignition front hands off to at the strike.
	const kindling = Math.min(1, elapsed / BEAT_MS.charge);
	return kindling * Math.pow(1 - t, 2);
}

export function drawGlowingStrokes(
	ctx: CanvasRenderingContext2D,
	activatedAt: number | null | undefined,
	activatedStrokeIds: Set<string> | null | undefined,
	strokes: Stroke[],
	duration: number,
	timestamp: number = performance.now()
): void {
	if (!activatedStrokeIds?.size || !activatedAt) {
		return;
	}

	const glowAlpha = glowAlphaAt(timestamp, activatedAt, duration);
	if (glowAlpha <= 0) {
		return;
	}

	for (const stroke of activeGlowStrokes(activatedStrokeIds, strokes)) {
		drawSingleGlowingStroke(ctx, stroke, timestamp, glowAlpha);
	}
}

// ---------------------------------------------------------------------------
// Seal guides
// ---------------------------------------------------------------------------

const FULL_CIRCLE_RAD = Math.PI * 2;

// The guides are the drawn ink laid thin, never a second color: a seal reports
// its own state in the pen it was written with. Idle and prepared are told apart
// by how much ink is down and whether the ring is filled, the same way the rest
// of the app carries emphasis by weight rather than hue.
const GUIDE_INK = '36, 27, 22';

const RING_GUIDE_IDLE_ALPHA = 0.06;
const RING_GUIDE_PREPARED_ALPHA = 0.12;
const RING_GUIDE_LINE_WIDTH = 6;
const PREPARED_PULSE_PERIOD_MS = 520;
// A field of ink reads heavier than a line of it, so the wash sits below the
// ring that encloses it and still comes up clearly against the parchment.
const PREPARED_WASH_BASE_ALPHA = 0.04;
const PREPARED_WASH_PULSE_ALPHA = 0.04;
const PREPARED_WASH_RADIUS_SCALE = 0.7;
const FAILED_FLICKER_PERIOD_MS = 70;
const FAILED_FLICKER_BASE_ALPHA = 0.14;
const FAILED_FLICKER_PULSE_ALPHA = 0.16;
const FAILED_FLICKER_LINE_WIDTH = 7;
const FAILED_FLICKER_DASH = [10, 14];
const FAILED_FLICKER_RADIUS_SCALE = 0.92;
const FAILED_FLICKER_RADIUS_PULSE_SCALE = 0.02;

function drawRingGuide(ctx: CanvasRenderingContext2D, ring: RingInfo, isPrepared: boolean): void {
	const alpha = isPrepared ? RING_GUIDE_PREPARED_ALPHA : RING_GUIDE_IDLE_ALPHA;
	ctx.save();
	ctx.strokeStyle = `rgba(${GUIDE_INK}, ${alpha})`;
	ctx.lineWidth = RING_GUIDE_LINE_WIDTH;
	ctx.beginPath();
	ctx.arc(ring.center.x, ring.center.y, ring.radius, 0, FULL_CIRCLE_RAD);
	ctx.stroke();
	ctx.restore();
}

function drawPreparedWash(ctx: CanvasRenderingContext2D, ring: RingInfo, timestamp: number): void {
	const pulse = 0.5 + Math.sin(timestamp / PREPARED_PULSE_PERIOD_MS) * 0.5;
	ctx.save();
	ctx.fillStyle = `rgba(${GUIDE_INK}, ${PREPARED_WASH_BASE_ALPHA + pulse * PREPARED_WASH_PULSE_ALPHA})`;
	ctx.beginPath();
	ctx.arc(
		ring.center.x,
		ring.center.y,
		ring.radius * PREPARED_WASH_RADIUS_SCALE,
		0,
		FULL_CIRCLE_RAD
	);
	ctx.fill();
	ctx.restore();
}

function drawFailedFlicker(ctx: CanvasRenderingContext2D, ring: RingInfo, timestamp: number): void {
	const pulse = Math.max(0, Math.sin(timestamp / FAILED_FLICKER_PERIOD_MS));
	ctx.save();
	ctx.strokeStyle = `rgba(184, 69, 49, ${FAILED_FLICKER_BASE_ALPHA + pulse * FAILED_FLICKER_PULSE_ALPHA})`;
	ctx.lineWidth = FAILED_FLICKER_LINE_WIDTH;
	ctx.setLineDash(FAILED_FLICKER_DASH);
	ctx.beginPath();
	ctx.arc(
		ring.center.x,
		ring.center.y,
		ring.radius * (FAILED_FLICKER_RADIUS_SCALE + pulse * FAILED_FLICKER_RADIUS_PULSE_SCALE),
		0,
		FULL_CIRCLE_RAD
	);
	ctx.stroke();
	ctx.restore();
}

/**
 * How a seal reads before it casts: a faint ring of ink on any idle ring, a wash
 * pulsing inside it once it is prepared, and a dashed red flicker when the
 * drawing will not compile. Red is the one hue left, kept for the one state that
 * is a warning rather than a reading. An active spell draws none of them; it is
 * the cast's frame from there.
 *
 * @example
 * drawSealGuides(ctx, recognition.spellIR, recognition.ring, timestamp);
 */
export function drawSealGuides(
	ctx: CanvasRenderingContext2D,
	spellIR: SpellIR | null | undefined,
	ring: RingInfo | null | undefined,
	timestamp: number
): void {
	if (!ring?.found || !spellIR || spellIR.active) {
		return;
	}

	drawRingGuide(ctx, ring, spellIR.prepared);
	if (!spellIR.valid) {
		drawFailedFlicker(ctx, ring, timestamp);
		return;
	}
	if (spellIR.prepared) {
		drawPreparedWash(ctx, ring, timestamp);
	}
}

export function drawRingDebug(
	ctx: CanvasRenderingContext2D,
	ring: RingInfo | null | undefined
): void {
	if (!ring?.found) {
		return;
	}

	ctx.save();
	ctx.lineWidth = 2;
	ctx.strokeStyle = ring.complete ? 'rgba(184, 69, 49, 0.72)' : 'rgba(31, 111, 115, 0.72)';
	ctx.setLineDash(ring.complete ? [] : [10, 10]);
	ctx.beginPath();
	ctx.arc(ring.center.x, ring.center.y, ring.radius, 0, Math.PI * 2);
	ctx.stroke();

	ctx.setLineDash([]);
	ctx.fillStyle = 'rgba(36, 27, 22, 0.62)';
	ctx.beginPath();
	ctx.arc(ring.center.x, ring.center.y, 4, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}
