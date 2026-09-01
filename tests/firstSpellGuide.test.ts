import assert from 'node:assert/strict';
import test from 'node:test';

import { pointAtLength, polylineLength, tracePathBetween } from '../src/lib/renderer/inkPath.js';
import { SpellPresetDataSchema } from '../src/lib/structures/spellPreset.js';
import {
	arcStroke,
	buildFirstSpellPractice,
	ghostStrokesFor,
	ringGhostStrokes,
	sealGhostStrokes,
	sigilGhostStrokes,
	type GhostEnvironment
} from '../src/lib/ui/simulator/first-spell-geometry.js';
import {
	FIRST_SPELL_CAPTIONS,
	firstSpellCoaching,
	resolveFirstSpellStep,
	stepHasGhost,
	stepOffersPractice,
	type FirstSpellSignals,
	type FirstSpellStep
} from '../src/lib/ui/simulator/first-spell-script.js';
import type { Point, RingInfo } from '../src/lib/types.js';

function signals(overrides: Partial<FirstSpellSignals> = {}): FirstSpellSignals {
	return {
		ringFound: false,
		ringComplete: false,
		sigilRecognized: false,
		active: false,
		castSpent: false,
		readingSettled: true,
		sigilUnclear: false,
		...overrides
	};
}

/** A 1000x800 paper, so the ideal ring is centered at 500,400 with radius 288. */
const PAPER = { canvasWidth: 1000, canvasHeight: 800, referenceSize: 800 };
const IDEAL_CENTER: Point = { x: 500, y: 400 };
const IDEAL_RADIUS = 288;

function ghostEnv(overrides: Partial<GhostEnvironment> = {}): GhostEnvironment {
	return { ...PAPER, ring: undefined, sigilStrokes: null, ...overrides };
}

function detectedRing(overrides: Partial<RingInfo> = {}): RingInfo {
	return { found: true, center: { x: 500, y: 400 }, radius: 300, ...overrides };
}

/** Four strokes, like the fire sigil the guide teaches. */
function sigilTemplate(): Point[][] {
	return [
		[
			{ x: 0.1, y: 0.1 },
			{ x: 0.9, y: 0.1 }
		],
		[
			{ x: 0.9, y: 0.1 },
			{ x: 0.9, y: 0.9 }
		],
		[
			{ x: 0.9, y: 0.9 },
			{ x: 0.1, y: 0.9 }
		],
		[
			{ x: 0.1, y: 0.9 },
			{ x: 0.1, y: 0.1 }
		]
	];
}

function near(actual: number, expected: number, tolerance = 1e-6): void {
	assert.ok(
		Math.abs(actual - expected) <= tolerance,
		`expected ${actual} to be within ${tolerance} of ${expected}`
	);
}

/** A point's angle in the ghost geometry's own y-flipped convention, in 0..360. */
function angleAt(point: Point, center: Point): number {
	return ((Math.atan2(center.y - point.y, point.x - center.x) * 180) / Math.PI + 360) % 360;
}

function pointAt(center: Point, radius: number, deg: number): Point {
	const radians = (deg * Math.PI) / 180;
	return { x: center.x + radius * Math.cos(radians), y: center.y - radius * Math.sin(radians) };
}

/** Degrees of the circle a point run covers, as 360 minus its widest empty arc. */
function angularCoverage(points: Point[], center: Point): number {
	const angles = points.map((point) => angleAt(point, center)).sort((a, b) => a - b);
	let largestGap = angles[0] + 360 - angles[angles.length - 1];
	for (let index = 1; index < angles.length; index += 1) {
		largestGap = Math.max(largestGap, angles[index] - angles[index - 1]);
	}
	return 360 - largestGap;
}

function mockPath() {
	const moves: Point[] = [];
	const lines: Point[] = [];
	const ctx = {
		moveTo(x: number, y: number) {
			moves.push({ x, y });
		},
		lineTo(x: number, y: number) {
			lines.push({ x, y });
		}
	};
	return { ctx: ctx as unknown as CanvasRenderingContext2D, moves, lines };
}

test('the walk step is read off the drawing alone', () => {
	assert.equal(resolveFirstSpellStep(signals()), 'ring');
	assert.equal(resolveFirstSpellStep(signals({ ringFound: true })), 'sigil');
	assert.equal(resolveFirstSpellStep(signals({ ringFound: true, sigilRecognized: true })), 'seal');
	assert.equal(resolveFirstSpellStep(signals({ active: true })), 'cast');
	assert.equal(resolveFirstSpellStep(signals({ castSpent: true })), 'cast');
	// A ring sealed before the sigil is drawn is still the sigil step.
	assert.equal(resolveFirstSpellStep(signals({ ringFound: true, ringComplete: true })), 'sigil');
});

test('an unsettled reading holds the step the walk already reached', () => {
	const unsettled = signals({ ringFound: true, readingSettled: false });
	assert.equal(resolveFirstSpellStep(unsettled, 'seal'), 'seal');
	// The seal step needs a settled reading, so a recognized sigil waits for it.
	assert.equal(resolveFirstSpellStep({ ...unsettled, sigilRecognized: true }, 'sigil'), 'sigil');
});

test('a settled reading may send the walk back a step', () => {
	assert.equal(resolveFirstSpellStep(signals({ ringFound: true }), 'seal'), 'sigil');
});

test('coaching stays quiet until the reading settles', () => {
	assert.equal(firstSpellCoaching(signals({ ringComplete: true, readingSettled: false })), null);
});

test('a ring sealed too soon earns the undo nudge, and a cast ring does not', () => {
	const sealed = signals({ ringFound: true, ringComplete: true });
	assert.match(firstSpellCoaching(sealed) ?? '', /small opening/);
	assert.equal(firstSpellCoaching({ ...sealed, castSpent: true }), null);
	assert.equal(firstSpellCoaching({ ...sealed, active: true }), null);
});

test('an unreadable sigil earns the trace-it-bolder nudge, and a read one earns nothing', () => {
	assert.match(
		firstSpellCoaching(signals({ ringFound: true, sigilUnclear: true })) ?? '',
		/larger and bolder/
	);
	assert.equal(firstSpellCoaching(signals({ ringFound: true, sigilRecognized: true })), null);
});

test('every walk step carries words and knows what it offers', () => {
	const steps = Object.keys(FIRST_SPELL_CAPTIONS) as FirstSpellStep[];
	for (const step of steps) {
		const caption = FIRST_SPELL_CAPTIONS[step];
		assert.ok(caption.ordinal.length > 0, `step ${step} has no ordinal`);
		assert.ok(caption.title.length > 0, `step ${step} has no title`);
		assert.ok(caption.body.length > 0, `step ${step} has no body`);
	}
	assert.deepEqual(
		steps.filter((step) => stepHasGhost(step)),
		['ring', 'sigil', 'seal']
	);
	assert.deepEqual(
		steps.filter((step) => stepOffersPractice(step)),
		['ring', 'sigil']
	);
});

test('arcStroke reads 90 degrees as up and always lands on the end angle', () => {
	const center: Point = { x: 100, y: 100 };
	const [up] = arcStroke(center, 50, 90, 90);
	near(up.x, center.x);
	assert.ok(up.y < center.y, `90 degrees should sit above the center, got y ${up.y}`);
	const [down] = arcStroke(center, 50, 270, 270);
	assert.ok(down.y > center.y, `270 degrees should sit below the center, got y ${down.y}`);
	// A sweep that is not a whole number of steps still ends exactly on endDeg.
	const arc = arcStroke(center, 50, 0, 45, 10);
	const expected = pointAt(center, 50, 45);
	near(arc[arc.length - 1].x, expected.x);
	near(arc[arc.length - 1].y, expected.y);
});

test('the ring ghost is one open circle with its gap at the bottom', () => {
	const strokes = ringGhostStrokes(ghostEnv());
	assert.equal(strokes.length, 1);
	const points = strokes[0];
	for (const point of points) {
		near(Math.hypot(point.x - IDEAL_CENTER.x, point.y - IDEAL_CENTER.y), IDEAL_RADIUS);
		const angle = angleAt(point, IDEAL_CENTER);
		const offBottom = Math.abs(((angle - 270 + 540) % 360) - 180);
		assert.ok(offBottom >= 20 - 1e-6, `point at ${angle} deg sits inside the gap`);
	}
	near(angleAt(points[0], IDEAL_CENTER), 290);
	near(angleAt(points[points.length - 1], IDEAL_CENTER), 250);
});

test('the sigil ghost fits the unit template into the detected ring center', () => {
	const ring = detectedRing({ center: { x: 500, y: 400 }, radius: 300 });
	const strokes = sigilGhostStrokes(
		ghostEnv({
			ring,
			sigilStrokes: [
				[
					{ x: 0, y: 0 },
					{ x: 1, y: 1 }
				]
			]
		})
	);
	assert.equal(strokes.length, 1);
	// A half-extent of 0.3 of the radius, so the unit box spans the center +/- 90.
	near(strokes[0][0].x, ring.center.x - 90);
	near(strokes[0][0].y, ring.center.y - 90);
	near(strokes[0][1].x, ring.center.x + 90);
	near(strokes[0][1].y, ring.center.y + 90);
});

test('the sigil ghost needs a template, and centers on the ideal ring without one detected', () => {
	assert.deepEqual(sigilGhostStrokes(ghostEnv({ sigilStrokes: null })), []);
	const [stroke] = sigilGhostStrokes(
		ghostEnv({
			sigilStrokes: [
				[
					{ x: 0.5, y: 0.5 },
					{ x: 1, y: 0.5 }
				]
			]
		})
	);
	near(stroke[0].x, IDEAL_CENTER.x);
	near(stroke[0].y, IDEAL_CENTER.y);
	near(stroke[1].x, IDEAL_CENTER.x + 0.3 * IDEAL_RADIUS);
});

test('the seal ghost spans the detected gap with an overlap past each edge', () => {
	const ring = detectedRing({
		center: { x: 480, y: 420 },
		radius: 260,
		gap: { startAngle: 250, endAngle: 290, sizeDegrees: 40 }
	});
	const strokes = sealGhostStrokes(ghostEnv({ ring }));
	assert.equal(strokes.length, 1);
	const points = strokes[0];
	const first = pointAt(ring.center, ring.radius, 242);
	const last = pointAt(ring.center, ring.radius, 298);
	near(points[0].x, first.x);
	near(points[0].y, first.y);
	near(points[points.length - 1].x, last.x);
	near(points[points.length - 1].y, last.y);
});

test('the seal ghost falls back to the bottom gap when the detector reported none', () => {
	const ring = detectedRing();
	const [points] = sealGhostStrokes(ghostEnv({ ring }));
	near(angleAt(points[0], ring.center), 242);
	near(angleAt(points[points.length - 1], ring.center), 298);
	for (const point of points) {
		near(Math.hypot(point.x - ring.center.x, point.y - ring.center.y), ring.radius);
	}
});

test('ghostStrokesFor routes each drawing step to its own ghost', () => {
	const env = ghostEnv({ ring: detectedRing(), sigilStrokes: sigilTemplate() });
	assert.deepEqual(ghostStrokesFor('ring', env), ringGhostStrokes(env));
	assert.deepEqual(ghostStrokesFor('sigil', env), sigilGhostStrokes(env));
	assert.deepEqual(ghostStrokesFor('seal', env), sealGhostStrokes(env));
});

test('the practice spell is a loadable v1 preset of the ring plus the sigil', () => {
	const square = { canvasWidth: 1000, canvasHeight: 1000, referenceSize: 1000 };
	const preset = buildFirstSpellPractice(square, sigilTemplate());
	assert.equal(preset.v, 1);
	assert.doesNotThrow(() => SpellPresetDataSchema.parse(preset));
	assert.equal(preset.strokes.length, 5);
	for (const stroke of preset.strokes) {
		for (const point of stroke.points) {
			assert.ok(point.x >= -1 && point.x <= 2, `x ${point.x} is outside the preset range`);
			assert.ok(point.y >= -1 && point.y <= 2, `y ${point.y} is outside the preset range`);
		}
	}
});

test('the practice ring ships open, so the drawer still seals it', () => {
	const square = { canvasWidth: 1000, canvasHeight: 1000, referenceSize: 1000 };
	const preset = buildFirstSpellPractice(square, sigilTemplate());
	const coverage = angularCoverage(preset.strokes[0].points, { x: 0.5, y: 0.5 });
	assert.ok(coverage > 300 && coverage < 330, `ring coverage ${coverage} should keep a gap`);
});

test('polylineLength sums the segments of a polyline', () => {
	near(
		polylineLength([
			{ x: 0, y: 0 },
			{ x: 3, y: 0 },
			{ x: 3, y: 4 }
		]),
		7
	);
	assert.equal(polylineLength([{ x: 1, y: 1 }]), 0);
});

test('pointAtLength walks the polyline and clamps at both ends', () => {
	const corner: Point[] = [
		{ x: 0, y: 0 },
		{ x: 3, y: 0 },
		{ x: 3, y: 4 }
	];
	assert.deepEqual(pointAtLength(corner, 0), { x: 0, y: 0 });
	assert.deepEqual(pointAtLength(corner, 5), { x: 3, y: 2 });
	assert.deepEqual(pointAtLength(corner, 100), { x: 3, y: 4 });
	assert.equal(pointAtLength([], 1), null);
});

test('tracePathBetween traces a span across a vertex as one contiguous line', () => {
	const path = mockPath();
	const corner: Point[] = [
		{ x: 0, y: 0 },
		{ x: 10, y: 0 },
		{ x: 10, y: 10 }
	];
	tracePathBetween(path.ctx, corner, 5, 15);
	assert.deepEqual(path.moves, [{ x: 5, y: 0 }]);
	assert.deepEqual(path.lines, [
		{ x: 10, y: 0 },
		{ x: 10, y: 5 }
	]);
});
