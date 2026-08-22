import assert from 'node:assert/strict';
import test from 'node:test';

import {
	FACING_TUNING,
	classifyTwist,
	facingFromTwist,
	quantizeFacing,
	readTwist
} from '../src/lib/compiler/reading/facing.js';
import { readSeal } from '../src/lib/compiler/reading/readSeal.js';
import { detectSymmetry } from '../src/lib/compiler/reading/symmetry.js';
import { FACING_TRUST_FLOOR, isFacingTrusted } from '../src/lib/compiler/reading/trust.js';
import { normalizeAngleDeg, vectorFromAngleDeg } from '../src/lib/utils/geometry.js';
import type {
	GlyphAST,
	RadialFacing,
	Recognition,
	RecognitionStatus,
	Vector
} from '../src/lib/types.js';

const CANONICAL_SIGN_BEARING_DEG = 270;

interface SignOptions {
	id?: string;
	manifestation?: string;
	angleDeg: number;
	/** ML pose twist away from inward. Omit for a sign with no accepted pose. */
	twistDeg?: number;
	/** Residual rotation the template matcher found after its bottom-of-ring pre-rotation. */
	templateWiggleDeg?: number;
	radialFacing?: RadialFacing;
	strokeCount?: number;
	radiusNorm?: number;
	sizeNorm?: number;
	lengthNorm?: number;
	confidence?: number;
	neatness?: number;
	recognitionStatus?: RecognitionStatus;
	layer?: string;
}

/**
 * Minimal recognized-sign fixture, carrying facing the way real recognitions do.
 * `twistDeg` produces an accepted ML pose, `templateWiggleDeg` a template-only
 * offset in the bottom-of-ring frame, and neither leaves the sign on the
 * stroke-geometry or canonical tier.
 */
function sign(options: SignOptions): Recognition {
	const angleDeg = options.angleDeg;
	const posed = options.twistDeg != null;
	const templated = options.templateWiggleDeg != null;
	const rotationOffsetDeg = posed
		? normalizeAngleDeg(-((options.twistDeg as number) + angleDeg + 90))
		: templated
			? normalizeAngleDeg(
					angleDeg - CANONICAL_SIGN_BEARING_DEG + (options.templateWiggleDeg as number)
				)
			: undefined;

	return {
		candidateId: 'c1',
		strokeIds: Array.from({ length: options.strokeCount ?? 2 }, (_, index) => `s${index}`),
		id: options.id ?? 'column',
		kind: 'sign',
		recognized: true,
		recognitionStatus: options.recognitionStatus ?? 'valid',
		confidence: options.confidence ?? 0.9,
		neatness: options.neatness ?? 0.85,
		layer: options.layer ?? 'outer',
		nearBoundary: false,
		angleDeg,
		radiusNorm: options.radiusNorm ?? 0.8,
		sizeNorm: options.sizeNorm ?? 0.16,
		lengthNorm: options.lengthNorm ?? 0.08,
		orientationDeg: 0,
		directedOrientationDeg: 0,
		rotationOffsetDeg,
		radialFacing: options.radialFacing ?? 'unclear',
		semantic: { manifestation: options.manifestation ?? 'column', directionMode: 'inward' },
		shape: {},
		diagnostics: posed ? { ml: { accepted: true } } : null
	} as unknown as Recognition;
}

function glyph(signs: Recognition[]): GlyphAST {
	return {
		type: 'GlyphAST',
		ring: { found: true, complete: true, center: { x: 0, y: 0 }, radius: 100, neatness: 0.9 },
		primarySigil: { id: 'flame', element: 'fire', confidence: 0.9, neatness: 0.9 },
		signs,
		unknowns: [],
		globalMetrics: { neatness: 0.9, radialSymmetry: 0.8, instability: 0.1 },
		warnings: []
	} as unknown as GlyphAST;
}

function bearingOf(vector: Vector): number {
	return normalizeAngleDeg((Math.atan2(-vector.y, vector.x) * 180) / Math.PI);
}

function magnitude(vector: Vector): number {
	return Math.hypot(vector.x, vector.y);
}

function sum(vectors: Vector[]): Vector {
	return vectors.reduce((total, vector) => ({ x: total.x + vector.x, y: total.y + vector.y }), {
		x: 0,
		y: 0
	});
}

function dot(a: Vector, b: Vector): number {
	return a.x * b.x + a.y * b.y;
}

function assertClose(actual: number, expected: number, tolerance = 1e-9) {
	assert.ok(
		Math.abs(actual - expected) <= tolerance,
		`expected ${actual} to be within ${tolerance} of ${expected}`
	);
}

test('a twist inside the dead band snaps to inward', () => {
	assert.equal(readTwist(sign({ angleDeg: 0, twistDeg: 8 })).twistDeg, 0);
	assert.equal(readTwist(sign({ angleDeg: 140, twistDeg: -11 })).twistDeg, 0);
});

test('a twist past the dead band survives intact', () => {
	assertClose(readTwist(sign({ angleDeg: 0, twistDeg: 20 })).twistDeg, 20);
	assertClose(readTwist(sign({ angleDeg: 0, twistDeg: -35 })).twistDeg, -35);
});

test('a dead-banded sign faces exactly at the seal center', () => {
	const reading = readSeal(glyph([sign({ angleDeg: 0, twistDeg: 8 })]));
	const [column] = reading.signs;

	assertClose(column.facing.x, -1);
	assertClose(column.facing.y, 0);
	assert.equal(column.facingClass, 'inward');
});

test('a facing oscillating across a class boundary does not flap', () => {
	const boundaryDeg = FACING_TUNING.obliqueThresholdDeg;
	assert.equal(classifyTwist(boundaryDeg - 3), 'inward');
	assert.equal(classifyTwist(boundaryDeg + 3), 'oblique');

	let held: 'inward' | ReturnType<typeof classifyTwist> = 'inward';
	for (const twistDeg of [boundaryDeg + 3, boundaryDeg - 3, boundaryDeg + 3, boundaryDeg - 3]) {
		held = quantizeFacing(twistDeg, held);
		assert.equal(held, 'inward');
	}
});

test('hysteresis releases once the facing moves decisively out of its class', () => {
	const released = quantizeFacing(45, 'inward');
	assert.equal(released, 'oblique');
	assert.equal(quantizeFacing(95, 'inward'), 'tangential-cw');
});

test('readSeal carries a facing class across recognition passes', () => {
	const first = readSeal(glyph([sign({ angleDeg: 30, twistDeg: 32 })]));
	assert.equal(first.signs[0].facingClass, 'inward');

	const refined = readSeal(glyph([sign({ angleDeg: 30, twistDeg: 38 })]), first);
	assert.equal(refined.signs[0].facingClass, 'inward');

	const fresh = readSeal(glyph([sign({ angleDeg: 30, twistDeg: 38 })]));
	assert.equal(fresh.signs[0].facingClass, 'oblique');
});

test('a sign that moved too far does not inherit the previous class', () => {
	const previous = readSeal(glyph([sign({ angleDeg: 30, twistDeg: 32, radiusNorm: 0.9 })]));
	const moved = readSeal(glyph([sign({ angleDeg: 30, twistDeg: 38, radiusNorm: 0.3 })]), previous);

	assert.equal(moved.signs[0].facingClass, 'oblique');
});

test('a different sign id does not inherit the previous class', () => {
	const previous = readSeal(glyph([sign({ angleDeg: 30, twistDeg: 32 })]));
	const other = readSeal(
		glyph([sign({ id: 'pull', manifestation: 'pull', angleDeg: 30, twistDeg: 38 })]),
		previous
	);

	assert.equal(other.signs[0].facingClass, 'oblique');
});

test('four hand-jittered columns snap to exact quarters', () => {
	const drawnBearings = [2, 88, 179, 271];
	const reading = readSeal(glyph(drawnBearings.map((angleDeg) => sign({ angleDeg, twistDeg: 0 }))));

	assert.equal(reading.symmetry, 4);
	assert.ok(reading.notes.includes('snapped-4-fold'));

	const snapped = reading.signs.map((column) => bearingOf(column.at)).sort((a, b) => a - b);
	[0, 90, 180, 270].forEach((expected, index) => assertClose(snapped[index], expected, 1e-6));
});

test('snapping removes the incidental facing bias a jittered ring carries', () => {
	const drawnBearings = [2, 88, 179, 271];
	const drawnNet = sum(drawnBearings.map((bearingDeg) => facingFromTwist(bearingDeg, 0)));
	assert.ok(magnitude(drawnNet) > 0.05, 'the drawn ring should drift before snapping');

	const reading = readSeal(glyph(drawnBearings.map((angleDeg) => sign({ angleDeg, twistDeg: 0 }))));
	assertClose(magnitude(sum(reading.signs.map((column) => column.facing))), 0);
});

test('uneven spacing is read as drawn', () => {
	const reading = readSeal(
		glyph([0, 60, 180, 270].map((angleDeg) => sign({ angleDeg, twistDeg: 0 })))
	);

	assert.equal(reading.symmetry, null);
	assert.deepEqual(reading.notes, []);
	assertClose(bearingOf(reading.signs[1].at), 60, 1e-6);
});

test('a lone sign has no symmetry', () => {
	assert.equal(detectSymmetry([45]), null);
	assert.equal(readSeal(glyph([sign({ angleDeg: 45, twistDeg: 0 })])).symmetry, null);
});

test('the facing hierarchy falls through in order as evidence runs out', () => {
	const posed = readSeal(glyph([sign({ angleDeg: 0, twistDeg: 90 })])).signs[0];
	const templated = readSeal(glyph([sign({ angleDeg: 0, templateWiggleDeg: 15 })])).signs[0];
	const drawn = readSeal(glyph([sign({ angleDeg: 0, strokeCount: 1, radialFacing: 'clockwise' })]))
		.signs[0];
	const canonical = readSeal(glyph([sign({ angleDeg: 0 })])).signs[0];

	assert.equal(posed.facingSource, 'ml-pose');
	assert.equal(templated.facingSource, 'template-rotation');
	assert.equal(drawn.facingSource, 'stroke-geometry');
	assert.equal(canonical.facingSource, 'canonical');

	assert.ok(posed.facingTrust > templated.facingTrust);
	assert.ok(templated.facingTrust > drawn.facingTrust);
	assert.ok(drawn.facingTrust > canonical.facingTrust);
});

test('a missing ML verdict degrades the facing instead of collapsing it', () => {
	const canonical = readSeal(glyph([sign({ angleDeg: 0 })])).signs[0];

	assert.equal(canonical.facingClass, 'inward');
	assertClose(canonical.facing.x, -1);
	assert.ok(isFacingTrusted(canonical), 'canon inward on a clean drawing stays usable');
});

test('draw order is ignored on a multi-stroke sign', () => {
	const multi = readSeal(glyph([sign({ angleDeg: 0, strokeCount: 2, radialFacing: 'outward' })]))
		.signs[0];

	assert.equal(multi.facingSource, 'canonical');
	assert.equal(multi.facingClass, 'inward');
});

test('R-06: a sloppy sign falls below the trust floor but keeps its length', () => {
	const sloppy = readSeal(
		glyph([
			sign({
				angleDeg: 0,
				confidence: 0.35,
				neatness: 0.4,
				recognitionStatus: 'valid_messy',
				lengthNorm: 0.08
			})
		])
	);
	const [messy] = sloppy.signs;

	assert.ok(messy.facingTrust < FACING_TRUST_FLOOR);
	assert.equal(isFacingTrusted(messy), false);
	assert.ok(sloppy.notes.includes('facing-untrusted'));
	assert.ok(messy.length > 0, 'an untrusted sign still contributes to the budget');
});

test('a cleanly drawn sign is trusted and raises no note', () => {
	const clean = readSeal(glyph([sign({ angleDeg: 0, twistDeg: 0 })]));

	assert.ok(clean.signs[0].facingTrust >= FACING_TRUST_FLOOR);
	assert.deepEqual(clean.notes, []);
});

test('a 122 degree pose error lands in a decisively wrong bucket', () => {
	const reading = readSeal(glyph([sign({ angleDeg: 90, twistDeg: 122 })]));
	const [column] = reading.signs;

	assert.equal(column.facingClass, 'tangential-cw');
	assert.notEqual(column.facingClass, 'oblique');

	const inward = vectorFromAngleDeg(90 + 180);
	assert.ok(dot(column.facing, inward) < 0, 'the facing commits away from the seal center');
});

test('a 122 degree pose error the other way reads as the opposite swirl', () => {
	const reading = readSeal(glyph([sign({ angleDeg: 90, twistDeg: -122 })]));

	assert.equal(reading.signs[0].facingClass, 'tangential-ccw');
});

test('power is size and layer, never confidence', () => {
	const strong = readSeal(glyph([sign({ angleDeg: 0, confidence: 0.95 })])).signs[0];
	const unsure = readSeal(glyph([sign({ angleDeg: 0, confidence: 0.4 })])).signs[0];
	const inner = readSeal(glyph([sign({ angleDeg: 0, layer: 'middle' })])).signs[0];
	const large = readSeal(glyph([sign({ angleDeg: 0, sizeNorm: 0.3 })])).signs[0];

	assert.equal(strong.power, unsure.power);
	assert.ok(strong.facingTrust > unsure.facingTrust);
	assert.ok(inner.power < strong.power);
	assert.ok(large.power > strong.power);
});

test('the reading carries the sigil id, element, and authored manifestation', () => {
	const reading = readSeal(
		glyph([sign({ angleDeg: 0, id: 'pull', manifestation: 'pull', twistDeg: 0 })])
	);

	assert.equal(reading.sigil, 'flame');
	assert.equal(reading.element, 'fire');
	assert.equal(reading.signs[0].manifestation, 'pull');
	assert.ok(reading.quality > 0);
});
