import assert from 'node:assert/strict';
import test from 'node:test';

import {
	buildInkRibbon,
	inkRibbonFor,
	traceInkRibbon
} from '../src/lib/ui/canvas/entities/inkRibbon.js';
import type { Point } from '../src/lib/types.js';

/** A straight run of points, evenly spaced, at a constant pace unless told otherwise. */
function run(count: number, spacing = 2, msPerPoint = 8): Point[] {
	return Array.from({ length: count }, (_, index) => ({
		x: index * spacing,
		y: 0,
		t: index * msPerPoint
	}));
}

/** The widest sample in a span of the mark, as a fraction of the whole. */
function widestBetween(
	ribbon: { samples: readonly { s: number; width: number }[]; length: number },
	from: number,
	to: number
): number {
	let widest = 0;
	for (const sample of ribbon.samples) {
		const at = sample.s / ribbon.length;
		if (at >= from && at <= to) {
			widest = Math.max(widest, sample.width);
		}
	}
	return widest;
}

/** Records the path a trace lays down, so a fill can be inspected without a canvas. */
function recordingContext() {
	const path: { x: number; y: number }[] = [];
	let closed = 0;
	return {
		path,
		closes: () => closed,
		ctx: {
			moveTo(x: number, y: number) {
				path.push({ x, y });
			},
			lineTo(x: number, y: number) {
				path.push({ x, y });
			},
			closePath() {
				closed += 1;
			}
		} as unknown as CanvasRenderingContext2D
	};
}

test('a mark lands and lifts instead of starting at full weight', () => {
	const ribbon = buildInkRibbon(run(120), 4.4);
	assert.ok(ribbon, 'expected a ribbon for a straight run');

	const first = ribbon.samples[0];
	const last = ribbon.samples[ribbon.samples.length - 1];
	const middle = widestBetween(ribbon, 0.45, 0.55);

	assert.ok(first.width < middle * 0.2, `expected a thin landing, got ${first.width} vs ${middle}`);
	assert.ok(last.width < middle * 0.2, `expected a thin lift, got ${last.width} vs ${middle}`);
});

test('the lift runs longer than the landing, which is the mark tail', () => {
	const ribbon = buildInkRibbon(run(200), 4.4);
	assert.ok(ribbon);

	const full = widestBetween(ribbon, 0.4, 0.6);
	const atWeight = ribbon.samples.filter((sample) => sample.width >= full * 0.95);
	const landing = atWeight[0].s;
	const lifting = ribbon.length - atWeight[atWeight.length - 1].s;

	assert.ok(landing > 0 && lifting > 0, 'expected the mark to taper at both ends');
	assert.ok(
		lifting > landing * 2,
		`expected a longer lift than landing, got ${lifting.toFixed(1)} against ${landing.toFixed(1)}`
	);
});

test('a hand that slows lays down more ink than one that hurries', () => {
	// Same geometry, same spacing: only the clock differs, slow through the
	// first half and quick through the second.
	const points: Point[] = [];
	for (let index = 0; index < 200; index += 1) {
		points.push({ x: index * 2, y: 0, t: index < 100 ? index * 24 : 100 * 24 + (index - 100) * 4 });
	}

	const ribbon = buildInkRibbon(points, 4.4);
	assert.ok(ribbon);
	assert.ok(
		widestBetween(ribbon, 0.3, 0.45) > widestBetween(ribbon, 0.55, 0.7) * 1.3,
		'expected the slow half to run visibly wider than the fast half'
	);
});

test('points without a clock keep an even width and take the taper alone', () => {
	const untimed = run(120).map(({ x, y }) => ({ x, y }));
	const ribbon = buildInkRibbon(untimed, 4.4);
	assert.ok(ribbon);

	// Everything clear of the landing and the lift sits at the nominal weight.
	const body = ribbon.samples.filter(
		(sample) => sample.s / ribbon.length > 0.35 && sample.s / ribbon.length < 0.6
	);
	assert.ok(body.length > 0);
	for (const sample of body) {
		assert.ok(
			Math.abs(sample.width - 4.4) < 0.01,
			`expected an even 4.4 through the body, got ${sample.width}`
		);
	}
});

test('a ring-sized mark is unreadable without two points, a width, or any travel', () => {
	assert.equal(buildInkRibbon([{ x: 1, y: 1 }], 4.4), null);
	assert.equal(buildInkRibbon(run(10), 0), null);
	assert.equal(
		buildInkRibbon(
			[
				{ x: 5, y: 5 },
				{ x: 5, y: 5 }
			],
			4.4
		),
		null
	);
});

test('the ribbon straddles the spine, so the mark stays where the stroke was drawn', () => {
	const ribbon = buildInkRibbon(run(60), 4.4);
	assert.ok(ribbon);

	const { path, ctx, closes } = recordingContext();
	traceInkRibbon(ctx, ribbon);

	assert.equal(closes(), 1, 'expected one closed subpath');
	// A horizontal stroke: every traced point sits on the drawn line in x, and
	// the two edges fall either side of it in y.
	const above = path.filter((point) => point.y > 0.05);
	const below = path.filter((point) => point.y < -0.05);
	assert.ok(above.length > 10 && below.length > 10, 'expected an edge either side of the spine');
	for (const point of path) {
		assert.ok(point.x >= -0.01 && point.x <= 118.01, `traced point ran off the stroke: ${point.x}`);
	}
});

test('tracing a span covers only that span, so the charge front can walk the mark', () => {
	const ribbon = buildInkRibbon(run(120), 4.4);
	assert.ok(ribbon);

	const { path, ctx } = recordingContext();
	traceInkRibbon(ctx, ribbon, { from: 60, to: 100 });

	const xs = path.map((point) => point.x);
	assert.ok(Math.min(...xs) >= 59.9, `span started early at ${Math.min(...xs)}`);
	assert.ok(Math.max(...xs) <= 100.1, `span ran past its end at ${Math.max(...xs)}`);
});

test('an empty span traces nothing', () => {
	const ribbon = buildInkRibbon(run(60), 4.4);
	assert.ok(ribbon);

	const { path, ctx } = recordingContext();
	traceInkRibbon(ctx, ribbon, { from: 40, to: 40 });
	traceInkRibbon(ctx, ribbon, { scale: 0 });
	assert.equal(path.length, 0);
});

test('scale widens the mark without moving it', () => {
	const ribbon = buildInkRibbon(run(60), 4.4);
	assert.ok(ribbon);

	const plain = recordingContext();
	traceInkRibbon(plain.ctx, ribbon);
	const doubled = recordingContext();
	traceInkRibbon(doubled.ctx, ribbon, { scale: 2 });

	const spread = (path: { y: number }[]) => Math.max(...path.map((point) => Math.abs(point.y)));
	assert.ok(
		Math.abs(spread(doubled.path) - spread(plain.path) * 2) < 0.01,
		'expected twice the width for scale 2'
	);
	assert.equal(doubled.path.length, plain.path.length, 'expected the same spine either way');
});

test('the cache reuses a mark until its points or its weight change', () => {
	const points = run(40);
	const first = inkRibbonFor(points, 4.4);
	assert.ok(first);
	assert.equal(inkRibbonFor(points, 4.4), first, 'expected the same mark back');
	assert.notEqual(inkRibbonFor(points, 8), first, 'a different weight is a different mark');

	// `Entity.scale` rescales a stroke's points in place, so identity alone is
	// not enough to say the mark still holds.
	for (const point of points) {
		point.x *= 2;
	}
	const rescaled = inkRibbonFor(points, 4.4);
	assert.notEqual(rescaled, first, 'expected a rebuild after the points moved');
	assert.ok(rescaled && rescaled.length > first.length);
});
