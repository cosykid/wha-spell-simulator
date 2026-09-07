/**
 * @file The ink's own geometry: a stroke's points read as a variable-width
 * mark rather than a constant-width line.
 *
 * A drawn mark holds no single width. It swells where the hand slowed, thins
 * where it hurried, and it lands and lifts rather than beginning and ending at
 * full weight. This module turns the points a stroke already carries into the
 * outline of such a mark, so ink can be filled as a shape instead of stroked
 * as a path.
 *
 * Nothing here changes what the recognizer reads. These are the same points
 * the parser, the eraser and a saved preset all see; a ribbon is one reading
 * of them, built at draw time and thrown away.
 *
 * Pace comes from the `t` every captured point already carries, so capture
 * needs no change. Points without a usable clock, a stamped placement or a
 * preset saved without one, keep an even width and take the taper alone.
 *
 * @example
 * const ribbon = inkRibbonFor(stroke.points, 4.4);
 * if (ribbon) {
 *   ctx.beginPath();
 *   traceInkRibbon(ctx, ribbon);
 *   ctx.fill();
 * }
 */

import type { Point } from '../../../types.js';
import { clamp } from '../../../utils/geometry.js';

const RIBBON = {
	// Canvas pixels; a longer segment is subdivided, so a stroke drawn fast
	// enough to outrun the pointer does not show its chords. Capture decimates
	// to about 1.4, so this is a copy for an ordinary stroke.
	maxSpacing: 3,

	// Canvas pixels; the spine's direction is read across a window this long
	// rather than between neighbours, so pointer quantization can roughen the
	// width but never the edge.
	tangentSpan: 4,

	// Samples averaged either side of each pace reading, so hand jitter does
	// not modulate the width.
	paceSmoothing: 2,

	// Quantile of a stroke's own speeds taken as its normal pace, so a few
	// hurried frames cannot define what normal is.
	referencePace: 0.65,

	// Width multiplier for a hand at rest, and how fast the mark thins as the
	// hand picks up. A hand at its own reference pace lands on 1, so a stroke
	// drawn evenly still weighs exactly what it was asked to weigh and the ink
	// as a whole is no lighter than the single width this replaced.
	restWidth: 1.65,
	paceInfluence: 0.65,
	minWidth: 0.5,

	// Landing, as the shorter of this share of the mark or this multiple of
	// its nominal width.
	land: { share: 0.09, widths: 2.6 },

	// Lifting takes longer than landing. That difference is the mark's tail.
	lift: { share: 0.24, widths: 8 },

	// Canvas pixels; a tip never closes completely, so a fill always has
	// something to cover.
	tipWidth: 0.3
} as const;

/** One sample along a mark: where the ink is, which way its edge lies, and how wide it runs there. */
export interface RibbonSample {
	x: number;
	y: number;
	/** Unit normal to the spine, pointing left of travel. */
	nx: number;
	ny: number;
	/** Arc length from the start of the mark. */
	s: number;
	/** Ink width here, in canvas pixels. */
	width: number;
}

/** A stroke's points, read as the outline of a drawn mark. */
export interface InkRibbon {
	readonly samples: readonly RibbonSample[];
	readonly length: number;
	/**
	 * The nominal weight this mark was built at. Layers drawn over the ink
	 * scale their own widths against it, so heavier ink carries a heavier glow.
	 */
	readonly baseWidth: number;
}

/** How the mark is walked when it is traced. */
export interface RibbonTrace {
	/** Multiplier on the ink's width at every sample. 1 hugs the ink exactly. */
	scale?: number;
	/** The span of the mark to trace, as arc length. Defaults to all of it. */
	from?: number;
	to?: number;
}

interface SpinePoint {
	x: number;
	y: number;
	/** The pace factor carried from the captured points this sample sits between. */
	pace: number;
}

function catmullRom(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
	const t2 = t * t;
	const t3 = t2 * t;
	return {
		x:
			0.5 *
			(2 * p1.x +
				(-p0.x + p2.x) * t +
				(2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
				(-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
		y:
			0.5 *
			(2 * p1.y +
				(-p0.y + p2.y) * t +
				(2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
				(-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
	};
}

/** How long the pointer spent on a stroke, or 0 when its points carry no usable clock. */
function timedSpan(points: readonly Point[]): number {
	let first: number | null = null;
	let last = 0;
	for (const point of points) {
		if (typeof point.t === 'number' && Number.isFinite(point.t)) {
			first ??= point.t;
			last = point.t;
		}
	}
	return first === null ? 0 : last - first;
}

/**
 * Per-point width multipliers, read from how fast the hand was moving. A slow
 * hand leaves more ink than a quick one, which is the difference a single
 * width throws away.
 */
function paceFactors(points: readonly Point[]): number[] {
	const even = points.map(() => 1);
	if (timedSpan(points) <= 0) {
		return even;
	}

	const speeds = points.map((_, index) => {
		const before = points[Math.max(0, index - 1)];
		const after = points[Math.min(points.length - 1, index + 1)];
		const elapsed = (after.t ?? 0) - (before.t ?? 0);
		return elapsed > 0 ? Math.hypot(after.x - before.x, after.y - before.y) / elapsed : 0;
	});

	const settled = speeds.map((_, index) => {
		let total = 0;
		let counted = 0;
		for (let near = index - RIBBON.paceSmoothing; near <= index + RIBBON.paceSmoothing; near += 1) {
			if (near < 0 || near >= speeds.length) {
				continue;
			}
			total += speeds[near];
			counted += 1;
		}
		return total / counted;
	});

	const ranked = [...settled].sort((a, b) => a - b);
	const pace = ranked[Math.floor(ranked.length * RIBBON.referencePace)] ?? 0;
	if (pace <= 0) {
		return even;
	}

	return settled.map((speed) =>
		clamp(1 + RIBBON.paceInfluence * (1 - speed / pace), RIBBON.minWidth, RIBBON.restWidth)
	);
}

/** The captured points, plus enough interpolated ones that no gap shows as a chord. */
function densify(points: readonly Point[], pace: readonly number[]): SpinePoint[] {
	const spine: SpinePoint[] = [];
	for (let index = 0; index < points.length - 1; index += 1) {
		const start = points[index];
		const end = points[index + 1];
		const steps = Math.max(
			1,
			Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / RIBBON.maxSpacing)
		);
		const before = points[Math.max(0, index - 1)];
		const after = points[Math.min(points.length - 1, index + 2)];
		for (let step = 0; step < steps; step += 1) {
			const t = step / steps;
			const at = steps === 1 ? start : catmullRom(before, start, end, after, t);
			spine.push({ x: at.x, y: at.y, pace: pace[index] * (1 - t) + pace[index + 1] * t });
		}
	}
	const last = points[points.length - 1];
	spine.push({ x: last.x, y: last.y, pace: pace[pace.length - 1] });
	return spine;
}

/** Eases in over the landing and out over the longer lift, both measured in arc length. */
function taperAt(walked: number, length: number, baseWidth: number): number {
	const land = Math.min(RIBBON.land.share * length, RIBBON.land.widths * baseWidth);
	const lift = Math.min(RIBBON.lift.share * length, RIBBON.lift.widths * baseWidth);
	const landing = land > 0 ? clamp(walked / land) : 1;
	const lifting = lift > 0 ? clamp((length - walked) / lift) : 1;
	// The landing eases to full weight. The lift runs to a point instead, so it
	// keeps slope where a smooth curve would flatten into a rounded stub.
	return landing * landing * (3 - 2 * landing) * Math.pow(lifting, 0.85);
}

/**
 * Reads a stroke's points as a drawn mark of nominal weight `baseWidth`.
 *
 * Returns null for anything that cannot carry a mark: fewer than two points, a
 * width that is not positive, or a path that never leaves where it started.
 */
export function buildInkRibbon(points: readonly Point[], baseWidth: number): InkRibbon | null {
	if (points.length < 2 || !(baseWidth > 0)) {
		return null;
	}

	const spine = densify(points, paceFactors(points));
	const walked = [0];
	for (let index = 1; index < spine.length; index += 1) {
		walked.push(
			walked[index - 1] +
				Math.hypot(spine[index].x - spine[index - 1].x, spine[index].y - spine[index - 1].y)
		);
	}

	const length = walked[walked.length - 1];
	if (length <= 0) {
		return null;
	}

	const samples: RibbonSample[] = [];
	const reach = RIBBON.tangentSpan / 2;
	let behind = 0;
	let ahead = 0;
	for (let index = 0; index < spine.length; index += 1) {
		// Two pointers over a monotonic arc length, so reading the direction
		// across a fixed span of paper still costs one pass.
		while (behind < index && walked[index] - walked[behind] > reach) {
			behind += 1;
		}
		while (ahead < spine.length - 1 && walked[ahead] - walked[index] < reach) {
			ahead += 1;
		}
		const from = spine[Math.min(behind, index)];
		const to = spine[Math.max(ahead, index)];
		const run = Math.hypot(to.x - from.x, to.y - from.y);
		const dx = run > 0 ? (to.x - from.x) / run : 1;
		const dy = run > 0 ? (to.y - from.y) / run : 0;
		samples.push({
			x: spine[index].x,
			y: spine[index].y,
			nx: -dy,
			ny: dx,
			s: walked[index],
			width: Math.max(
				RIBBON.tipWidth,
				baseWidth * spine[index].pace * taperAt(walked[index], length, baseWidth)
			)
		});
	}

	return { samples, length, baseWidth };
}

interface CachedRibbon {
	baseWidth: number;
	count: number;
	firstX: number;
	firstY: number;
	lastX: number;
	lastY: number;
	ribbon: InkRibbon | null;
}

// One ribbon per points array, so the ink, its glow and the charge beat all
// read the same stroke once a frame instead of three times. The key is weak,
// and the endpoints are checked beside it because `Entity.scale` rescales a
// stroke's points in place rather than replacing them.
const cache = new WeakMap<readonly Point[], CachedRibbon>();

/**
 * The mark for these points, built once and reused until they change.
 *
 * Prefer this over {@link buildInkRibbon} for stroke arrays that live across
 * frames. Points assembled per frame, a placement mapped into canvas space,
 * gain nothing from it and should build directly.
 */
export function inkRibbonFor(points: readonly Point[], baseWidth: number): InkRibbon | null {
	const first = points[0];
	const last = points[points.length - 1];
	if (!first || !last) {
		return null;
	}

	const cached = cache.get(points);
	if (
		cached &&
		cached.baseWidth === baseWidth &&
		cached.count === points.length &&
		cached.firstX === first.x &&
		cached.firstY === first.y &&
		cached.lastX === last.x &&
		cached.lastY === last.y
	) {
		return cached.ribbon;
	}

	const ribbon = buildInkRibbon(points, baseWidth);
	cache.set(points, {
		baseWidth,
		count: points.length,
		firstX: first.x,
		firstY: first.y,
		lastX: last.x,
		lastY: last.y,
		ribbon
	});
	return ribbon;
}

/** Where the mark runs at one arc length, interpolated between samples and clamped to its ends. */
function sampleAt(ribbon: InkRibbon, walked: number): RibbonSample {
	const { samples } = ribbon;
	if (walked <= 0) {
		return samples[0];
	}
	if (walked >= ribbon.length) {
		return samples[samples.length - 1];
	}

	let index = 1;
	while (index < samples.length - 1 && samples[index].s < walked) {
		index += 1;
	}
	const before = samples[index - 1];
	const after = samples[index];
	const gap = after.s - before.s;
	const t = gap > 0 ? (walked - before.s) / gap : 0;
	const nx = before.nx + (after.nx - before.nx) * t;
	const ny = before.ny + (after.ny - before.ny) * t;
	const unit = Math.hypot(nx, ny) || 1;
	return {
		x: before.x + (after.x - before.x) * t,
		y: before.y + (after.y - before.y) * t,
		nx: nx / unit,
		ny: ny / unit,
		s: walked,
		width: before.width + (after.width - before.width) * t
	};
}

/**
 * Adds one mark's outline to the current path as a closed subpath, ready to
 * fill. Neither begins nor fills the path, so several marks compose into one
 * fill the way `tracePathBetween` composes into one stroke.
 */
export function traceInkRibbon(
	ctx: CanvasRenderingContext2D,
	ribbon: InkRibbon,
	trace: RibbonTrace = {}
): void {
	const scale = trace.scale ?? 1;
	const from = Math.max(trace.from ?? 0, 0);
	const to = Math.min(trace.to ?? ribbon.length, ribbon.length);
	if (to <= from || scale <= 0) {
		return;
	}

	const span: RibbonSample[] = [sampleAt(ribbon, from)];
	for (const sample of ribbon.samples) {
		if (sample.s > from && sample.s < to) {
			span.push(sample);
		}
	}
	span.push(sampleAt(ribbon, to));

	// Out along one edge and back along the other, one winding, so a mark that
	// crosses itself fills as its union rather than punching a hole in itself.
	for (let index = 0; index < span.length; index += 1) {
		const sample = span[index];
		const half = (sample.width * scale) / 2;
		const x = sample.x + sample.nx * half;
		const y = sample.y + sample.ny * half;
		if (index === 0) {
			ctx.moveTo(x, y);
		} else {
			ctx.lineTo(x, y);
		}
	}
	for (let index = span.length - 1; index >= 0; index -= 1) {
		const sample = span[index];
		const half = (sample.width * scale) / 2;
		ctx.lineTo(sample.x - sample.nx * half, sample.y - sample.ny * half);
	}
	ctx.closePath();
}
