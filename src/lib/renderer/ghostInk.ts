/**
 * @file The first-spell guide's ghost ink: the faint golden strokes a beginner
 * traces over, with a wisp of light that walks the path in drawing order to
 * show where each mark starts and ends.
 *
 * Ghost ink draws under the drawer's own ink and only on non-active states, the
 * same rule the seal guides follow, so the portal tilt and the cast never see
 * it. Everything is a function of the timestamp it is handed.
 */

import { pointAtLength, polylineLength, tracePathBetween } from './inkPath.js';
import type { Point } from '../types.js';

const GHOST = {
	/** A soft warm bed under the dashes, so the path reads as light on paper. */
	underlay: { color: 'rgba(255, 196, 90, 0.22)', width: 9 },
	/** The traceable line itself: dashed, in the guide's gold. */
	dash: { color: 'rgba(146, 104, 22, 0.55)', width: 3, pattern: [7, 9] as number[] },
	/** The wisp's bright trailing ink, in the ignition's warm palette. */
	head: { rgb: '255, 233, 198', glow: 'rgb(255, 186, 108)', width: 3.4, blur: 14, span: 90 },
	/** The glowing tip riding the front of the wisp. */
	tip: { radius: 5, color: 'rgba(255, 233, 198, 0.9)', glow: 'rgb(255, 186, 108)', blur: 16 },
	/** Canvas pixels the wisp travels per millisecond. */
	speedPxPerMs: 0.55,
	/** Pause at the end of a lap before the wisp sets out again. */
	restMs: 700
} as const;

/** Lazily created so importing this module in a unit test never touches `window`. */
let reducedMotionQuery: MediaQueryList | null | undefined;

function prefersReducedMotion(): boolean {
	if (reducedMotionQuery === undefined) {
		reducedMotionQuery =
			typeof window === 'undefined' ? null : window.matchMedia('(prefers-reduced-motion: reduce)');
	}
	return reducedMotionQuery?.matches ?? false;
}

function drawGhostBase(ctx: CanvasRenderingContext2D, strokes: readonly Point[][]): void {
	ctx.save();
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	for (const pass of [GHOST.underlay, GHOST.dash]) {
		ctx.strokeStyle = pass.color;
		ctx.lineWidth = pass.width;
		ctx.setLineDash(pass === GHOST.dash ? GHOST.dash.pattern : []);
		for (const stroke of strokes) {
			if (stroke.length < 2) {
				continue;
			}
			ctx.beginPath();
			ctx.moveTo(stroke[0].x, stroke[0].y);
			for (let index = 1; index < stroke.length; index += 1) {
				ctx.lineTo(stroke[index].x, stroke[index].y);
			}
			ctx.stroke();
		}
	}
	ctx.restore();
}

function drawWisp(
	ctx: CanvasRenderingContext2D,
	strokes: readonly Point[][],
	timestamp: number
): void {
	const lengths = strokes.map(polylineLength);
	const total = lengths.reduce((sum, length) => sum + length, 0);
	if (total <= 0) {
		return;
	}

	const lapMs = total / GHOST.speedPxPerMs + GHOST.restMs;
	const lapT = (timestamp % lapMs) / lapMs;
	const travelShare = 1 - GHOST.restMs / lapMs;
	const run = Math.min(1, lapT / travelShare);
	// The same smoothstep ease the ignition front uses, so guide and cast move
	// with one gait.
	const front = total * run * run * (3 - 2 * run);
	// The wisp fades while it rests at the end of the path, then relights.
	const restT = Math.max(0, (lapT - travelShare) / (1 - travelShare));
	const alpha = 1 - restT;
	if (alpha <= 0) {
		return;
	}

	ctx.save();
	ctx.globalCompositeOperation = 'lighter';
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.strokeStyle = `rgba(${GHOST.head.rgb}, ${0.7 * alpha})`;
	ctx.lineWidth = GHOST.head.width;
	ctx.shadowBlur = GHOST.head.blur;
	ctx.shadowColor = GHOST.head.glow;
	ctx.beginPath();
	let walked = 0;
	for (const [index, stroke] of strokes.entries()) {
		tracePathBetween(ctx, stroke, front - GHOST.head.span - walked, front - walked);
		walked += lengths[index];
	}
	ctx.stroke();

	const tip = tipPoint(strokes, lengths, front);
	if (tip) {
		ctx.fillStyle = GHOST.tip.color;
		ctx.globalAlpha = alpha;
		ctx.shadowBlur = GHOST.tip.blur;
		ctx.shadowColor = GHOST.tip.glow;
		ctx.beginPath();
		ctx.arc(tip.x, tip.y, GHOST.tip.radius, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.restore();
}

function tipPoint(
	strokes: readonly Point[][],
	lengths: readonly number[],
	front: number
): Point | null {
	let walked = 0;
	for (const [index, stroke] of strokes.entries()) {
		if (front <= walked + lengths[index]) {
			return pointAtLength(stroke, front - walked);
		}
		walked += lengths[index];
	}
	const last = strokes[strokes.length - 1];
	return last ? pointAtLength(last, Number.POSITIVE_INFINITY) : null;
}

/**
 * Draws one step's ghost strokes: the dashed traceable path, plus the walking
 * wisp unless the drawer asked for reduced motion.
 *
 * @example
 * drawGhostInk(ctx, ghostStrokesFor('ring', env), timestamp);
 */
export function drawGhostInk(
	ctx: CanvasRenderingContext2D,
	strokes: readonly Point[][],
	timestamp: number
): void {
	if (strokes.length === 0) {
		return;
	}
	drawGhostBase(ctx, strokes);
	if (!prefersReducedMotion()) {
		drawWisp(ctx, strokes, timestamp);
	}
}
