import assert from 'node:assert/strict';
import test from 'node:test';

import { CONFIG } from '../src/lib/config.js';
import { classifyDrawing } from '../src/lib/parser/classifier/index.js';
import { detectRing } from '../src/lib/parser/rings/index.js';
import { degreesToRadians } from '../src/lib/utils/geometry.js';
import repetitionNearRing from './fixtures/repetition-near-ring.json' with { type: 'json' };
import type { Point, Stroke, SignEntry, StrokeTemplate } from '../src/lib/types.js';

function arcStroke(
	id: string,
	centerX: number,
	centerY: number,
	radius: number,
	startDeg: number,
	endDeg: number,
	steps: number
): Stroke {
	const points: Point[] = [];

	for (let index = 0; index <= steps; index += 1) {
		const deg = startDeg + (endDeg - startDeg) * (index / steps);
		const radians = degreesToRadians(deg);
		points.push({
			x: centerX + Math.cos(radians) * radius,
			y: centerY + Math.sin(radians) * radius
		});
	}

	return { id, points };
}

function openRingStroke(id = 's1'): Stroke {
	return arcStroke(id, 400, 300, 180, 25, 335, 160);
}

function closingStroke(id = 's2'): Stroke {
	return arcStroke(id, 400, 300, 180, 335, 385, 32);
}

function outsideStroke(id = 's2'): Stroke {
	return {
		id,
		points: [
			{ x: 900, y: 130 },
			{ x: 940, y: 150 },
			{ x: 930, y: 190 }
		]
	};
}

function openRingAt(id: string, centerX: number, centerY: number, radius = 120): Stroke {
	return arcStroke(id, centerX, centerY, radius, 25, 335, 128);
}

function closingStrokeAt(id: string, centerX: number, centerY: number, radius = 120): Stroke {
	return arcStroke(id, centerX, centerY, radius, 335, 385, 28);
}

test('detects a sealed ring without outside strokes', () => {
	const openRing = openRingStroke();
	const closing = closingStroke();
	const prepared = detectRing([openRing], null, CONFIG);
	const sealed = detectRing([openRing, closing], prepared, CONFIG);

	assert.equal(prepared.found, true);
	assert.equal(prepared.complete, false);
	assert.equal(sealed.complete, true);
	assert.equal(sealed.activationEvent, true);
	assert.deepEqual(sealed.strokeIds, ['s1', 's2']);
	assert.equal(Object.hasOwn(sealed, 'topology'), false);
	assert.equal(Object.hasOwn(sealed, 'coverageBinCount'), false);
});

test('keeps a short closing stroke in sealed ring ids', () => {
	const openRing = arcStroke('s1', 400, 300, 180, 5, 355, 180);
	const closing = arcStroke('s2', 400, 300, 180, 355, 365, 8);
	const prepared = detectRing([openRing], null, CONFIG);
	const sealed = detectRing([openRing, closing], prepared, CONFIG);

	assert.equal(prepared.found, true);
	assert.equal(prepared.complete, false);
	assert.equal(sealed.complete, true);
	assert.equal(sealed.activationEvent, true);
	assert.deepEqual(sealed.strokeIds, ['s1', 's2']);
});

test('reports multiple open rings as unsupported', () => {
	const firstRing = openRingAt('s1', 260, 300);
	const secondRing = openRingAt('s2', 620, 300);
	const detected = detectRing([firstRing, secondRing], null, CONFIG);

	assert.equal(detected.found, true);
	assert.equal(detected.complete, false);
	assert.equal(detected.activationEvent, false);
	assert.equal(detected.unsupportedMultipleRings!.length, 1);
});

test('does not activate when closing one of multiple rings', () => {
	const firstRing = openRingAt('s1', 260, 300);
	const secondRing = openRingAt('s2', 620, 300);
	const firstClosingStroke = closingStrokeAt('s3', 260, 300);
	const prepared = detectRing([firstRing, secondRing], null, CONFIG);
	const sealed = detectRing([firstRing, secondRing, firstClosingStroke], prepared, CONFIG);

	assert.equal(sealed.found, true);
	assert.equal(sealed.activationEvent, false);
	assert.equal(sealed.unsupportedMultipleRings!.length, 1);
});

test('ignores outside strokes when sealing a prepared ring', () => {
	const openRing = openRingStroke('s1');
	const outside = outsideStroke('s2');
	const closing = closingStroke('s3');
	const prepared = detectRing([openRing], null, CONFIG);
	const preparedWithOutsideMark = detectRing([openRing, outside], prepared, CONFIG);
	const sealed = detectRing([openRing, outside, closing], preparedWithOutsideMark, CONFIG);

	assert.equal(preparedWithOutsideMark.found, true);
	assert.equal(preparedWithOutsideMark.complete, false);
	assert.equal(sealed.complete, true);
	assert.equal(sealed.activationEvent, true);
	assert.deepEqual(sealed.strokeIds, ['s1', 's3']);
});

test('ignores outside strokes when closed ring is evaluated without prior state', () => {
	const openRing = openRingStroke('s1');
	const outside = outsideStroke('s2');
	const closing = closingStroke('s3');
	const sealed = detectRing([openRing, outside, closing], null, CONFIG);

	assert.equal(sealed.complete, true);
	assert.equal(sealed.activationEvent, false);
	assert.deepEqual(sealed.strokeIds, ['s1', 's3']);
});

/** Closed circle whose stroke carries a glyph-style tail spiraling inward. */
function loopWithTailStroke(id: string, centerX: number, centerY: number, radius: number): Stroke {
	const loop = arcStroke(id, centerX, centerY, radius, 0, 360, 96);
	// Tail spirals from the loop deep into the interior, like billowing or a
	// water loop; its ink is a large fraction of the loop's circumference.
	for (let index = 0; index <= 48; index += 1) {
		const t = index / 48;
		const spiralRadius = radius * (0.72 - t * 0.5);
		const radians = degreesToRadians(t * 360);
		loop.points.push({
			x: centerX + Math.cos(radians) * spiralRadius,
			y: centerY + Math.sin(radians) * spiralRadius
		});
	}
	return loop;
}

/** Straight strokes that cross the circle line, like a light sigil's rays. */
function crossingRays(centerX: number, centerY: number, radius: number): Stroke[] {
	return [0, 90].map((deg, index) => {
		const radians = degreesToRadians(deg);
		return {
			id: `ray-${index}`,
			points: [0.6, 0.8, 1.0, 1.2, 1.4].map((scale) => ({
				x: centerX + Math.cos(radians) * radius * scale,
				y: centerY + Math.sin(radians) * radius * scale
			}))
		};
	});
}

test('does not treat a circular glyph loop with a tail as a ring', () => {
	const glyph = loopWithTailStroke('g1', 400, 300, 90);
	const detected = detectRing([glyph], null, CONFIG);

	assert.equal(detected.found, false);
});

/**
 * Weave-like open arc: sweeps most of a circle but enters and exits through
 * corner ticks that sit well off the circle line.
 */
function weaveLikeStroke(id: string, centerX: number, centerY: number, radius: number): Stroke {
	const entry: Point[] = [
		{ x: centerX - radius, y: centerY + radius },
		{ x: centerX - radius * 0.85, y: centerY + radius * 0.85 }
	];
	const sweep = arcStroke('tmp', centerX, centerY, radius, 135, 405, 120).points;
	const exit: Point[] = [
		{ x: centerX + radius * 0.85, y: centerY + radius * 0.85 },
		{ x: centerX + radius, y: centerY + radius }
	];
	return { id, points: [...entry, ...sweep, ...exit] };
}

test('does not treat a weave-like open arc with corner ticks as a ring', () => {
	for (const radius of [80, 120, 170]) {
		const detected = detectRing([weaveLikeStroke('g1', 400, 300, radius)], null, CONFIG);
		assert.equal(detected.found, false, `weave-like arc at radius ${radius} became a ring`);
	}
});

test('a weave-like arc inside a prepared ring is not a second ring', () => {
	const openRing = openRingStroke('s1');
	const prepared = detectRing([openRing], null, CONFIG);
	const withWeave = detectRing([openRing, weaveLikeStroke('g1', 400, 360, 80)], prepared, CONFIG);

	assert.equal(withWeave.found, true);
	assert.ok(withWeave.radius > 150);
	assert.equal(withWeave.unsupportedMultipleRings!.length, 0);
});

test('does not treat a lobed cloud loop like billowing as a ring', () => {
	// Hand-drawn billowing reads as a closed loop of lobes; its radius swings in
	// and out several times per revolution while a real ring drifts slowly.
	const points: Point[] = [];
	for (let deg = 0; deg <= 360; deg += 2) {
		const radians = degreesToRadians(deg);
		const radius = 95 * (1 + 0.11 * Math.sin(3 * radians));
		points.push({ x: 400 + Math.cos(radians) * radius, y: 300 + Math.sin(radians) * radius });
	}
	const detected = detectRing([{ id: 'g1', points }], null, CONFIG);

	assert.equal(detected.found, false);
});

test('still detects an elliptical, wobbly hand-drawn ring', () => {
	const points: Point[] = [];
	for (let deg = 0; deg <= 360; deg += 2) {
		const radians = degreesToRadians(deg);
		const radius = 160 * (1 + 0.09 * Math.sin(2 * radians)) + Math.sin(deg * 1.7) * 3;
		points.push({ x: 400 + Math.cos(radians) * radius, y: 300 + Math.sin(radians) * radius });
	}
	const detected = detectRing([{ id: 's1', points }], null, CONFIG);

	assert.equal(detected.found, true);
	assert.equal(detected.complete, true);
});

test('does not treat a circle with a long attached inner curl as a ring', () => {
	const circle = arcStroke('g1', 400, 300, 90, 0, 360, 96);
	// A curl attached to the loop, mostly inside it, like billowing's inner stroke.
	const curl = arcStroke('g2', 445, 300, 45, 0, 300, 48);
	const detected = detectRing([circle, curl], null, CONFIG);

	assert.equal(detected.found, false);
});

test('does not treat a circle with crossing strokes as a ring', () => {
	const circle = arcStroke('g1', 400, 300, 90, 0, 360, 96);
	const detected = detectRing([circle, ...crossingRays(400, 300, 90)], null, CONFIG);

	assert.equal(detected.found, false);
});

test('keeps a drawn ring when a placed repetition glyph grazes its band', () => {
	// Captured from the simulator: fire sigil + repetition sign placed inside a
	// freehand ring whose line passes within touch tolerance of the repetition
	// loop. The loop is long enough to read as an attached curl by length, but
	// its ends rest on its own glyph, not on the ring, so the ring must stand.
	const strokes = repetitionNearRing as Stroke[];
	const detected = detectRing(strokes, null, CONFIG);

	assert.equal(detected.found, true);
	assert.equal(detected.complete, true);
	assert.ok(detected.radius > 300, `expected the drawn ring, got radius ${detected.radius}`);
});

test('keeps the prepared ring when a circular glyph closes inside it', () => {
	const openRing = openRingStroke('s1');
	const prepared = detectRing([openRing], null, CONFIG);
	const glyph = loopWithTailStroke('g1', 400, 300, 85);
	const detected = detectRing([openRing, glyph], prepared, CONFIG);

	assert.equal(detected.found, true);
	assert.equal(detected.complete, false);
	assert.equal(detected.activationEvent, false);
	assert.ok(detected.radius > 150, `ring stolen by glyph circle, radius ${detected.radius}`);
});

test('sealing a ring around a circular glyph still activates', () => {
	const openRing = openRingStroke('s1');
	const glyph = loopWithTailStroke('g1', 400, 300, 85);
	const prepared = detectRing([openRing, glyph], null, CONFIG);
	const sealed = detectRing([openRing, glyph, closingStroke('s2')], prepared, CONFIG);

	assert.equal(sealed.complete, true);
	assert.equal(sealed.activationEvent, true);
	assert.equal(sealed.unsupportedMultipleRings!.length, 0);
	assert.ok(sealed.radius > 150);
});

test('classifies symbols inside a detected ring without crashing', () => {
	const openRing = openRingStroke('s1');
	const closing = closingStroke('s2');
	const columnStem: Stroke = {
		id: 's3',
		points: [
			{ x: 400, y: 285 },
			{ x: 400, y: 365 }
		]
	};
	const columnBase: Stroke = {
		id: 's4',
		points: [
			{ x: 360, y: 365 },
			{ x: 440, y: 365 }
		]
	};
	const columnStrokeTemplate: StrokeTemplate = {
		sourceAspectRatio: 1,
		strokes: [
			[
				{ x: 0.5, y: 0.12 },
				{ x: 0.5, y: 0.8 }
			],
			[
				{ x: 0.18, y: 0.8 },
				{ x: 0.82, y: 0.8 }
			]
		]
	};
	const columnEntry: SignEntry = {
		id: 'column',
		displayName: 'Column',
		allowedLayers: ['center', 'middle', 'outer'],
		semantic: {
			manifestation: 'column',
			directionMode: 'inward'
		},
		strokeTemplate: columnStrokeTemplate
	};
	const dictionary: { sigils: never[]; signs: SignEntry[] } = {
		sigils: [],
		signs: [columnEntry]
	};

	const result = classifyDrawing({
		strokes: [openRing, closing, columnStem, columnBase],
		previousRing: null,
		dictionary,
		config: CONFIG
	});

	assert.equal(result.ring.complete, true);
	assert.ok(result.candidates.length >= 1);
	assert.equal(result.recognitions[0].id, 'column');
	assert.ok(result.recognitions[0].diagnostics);
	assert.equal(result.glyphAST.signs[0].id, 'column');
	assert.equal(Object.hasOwn(result.glyphAST.signs[0], 'diagnostics'), false);
});
