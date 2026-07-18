import assert from 'node:assert/strict';
import test from 'node:test';

import {
	cutRingGap,
	deserializeSpellPreset,
	serializeSpellPreset,
	SpellPresetDataSchema,
	SPELL_PRESET_VERSION,
	type SpellDrawing
} from '../src/lib/structures/spellPreset.js';
import type { RingInfo, Stroke } from '../src/lib/types.js';

const CANVAS = 1000;

function circleStroke(
	id: string,
	cx: number,
	cy: number,
	radius: number | ((angleDeg: number) => number),
	startDeg = 0,
	endDeg = 360,
	stepDeg = 4
): Stroke {
	const points = [];
	for (let angle = startDeg; angle <= endDeg; angle += stepDeg) {
		const r = typeof radius === 'number' ? radius : radius(angle);
		const rad = (angle * Math.PI) / 180;
		points.push({ x: cx + Math.cos(rad) * r, y: cy + Math.sin(rad) * r, t: angle });
	}
	return { id, points };
}

function sealedRing(): RingInfo {
	return { found: true, complete: true, center: { x: 500, y: 500 }, radius: 300 };
}

/** Degrees of the circle the strokes cover, as 360 minus the widest empty arc. */
function angularCoverage(strokes: Stroke[], cx: number, cy: number): number {
	const angles = strokes
		.flatMap((stroke) => stroke.points)
		.map((point) => ((Math.atan2(point.y - cy, point.x - cx) * 180) / Math.PI + 360) % 360)
		.sort((a, b) => a - b);
	if (angles.length < 2) {
		return 0;
	}
	let largestGap = angles[0] + 360 - angles[angles.length - 1];
	for (let index = 1; index < angles.length; index += 1) {
		largestGap = Math.max(largestGap, angles[index] - angles[index - 1]);
	}
	return 360 - largestGap;
}

test('round-trips strokes and placements at the same canvas size', () => {
	const drawing: SpellDrawing = {
		strokes: [
			{
				id: 's9',
				points: [
					{ x: 100, y: 200, t: 5 },
					{ x: 300, y: 400, t: 25 }
				]
			}
		],
		placements: [
			{
				id: 'p7',
				kind: 'sigil',
				sourceId: 'fire',
				baseStrokes: [
					[
						{ x: 0.2, y: 0.4 },
						{ x: 0.8, y: 0.6 }
					]
				],
				transform: { cx: 420, cy: 380, scaleX: 220, scaleY: 220, rotationDeg: 30 }
			}
		]
	};

	const preset = serializeSpellPreset(drawing, CANVAS, null);
	assert.equal(preset.v, SPELL_PRESET_VERSION);
	assert.doesNotThrow(() => SpellPresetDataSchema.parse(preset));

	const restored = deserializeSpellPreset(preset, CANVAS);
	assert.equal(restored.strokes[0].id, 's1');
	assert.equal(restored.placements[0].id, 'p1');
	assert.deepEqual(
		restored.strokes[0].points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), t: p.t })),
		[
			{ x: 100, y: 200, t: 5 },
			{ x: 300, y: 400, t: 25 }
		]
	);
	assert.equal(restored.strokes[0].startedAt, 5);
	assert.equal(restored.strokes[0].endedAt, 25);
	assert.deepEqual(restored.placements[0].transform, drawing.placements[0].transform);
});

test('deserializing at another canvas size rescales everything uniformly', () => {
	const drawing: SpellDrawing = {
		strokes: [{ id: 's1', points: [{ x: 500, y: 250 }] }],
		placements: [
			{
				id: 'p1',
				kind: 'ring',
				sourceId: 'ring',
				baseStrokes: [[{ x: 0, y: 0.5 }]],
				transform: { cx: 500, cy: 500, scaleX: 620, scaleY: 620, rotationDeg: 0 }
			}
		]
	};
	const preset = serializeSpellPreset(drawing, CANVAS, null);
	const restored = deserializeSpellPreset(preset, CANVAS / 2);
	assert.deepEqual(restored.strokes[0].points[0], { x: 250, y: 125 });
	assert.deepEqual(restored.placements[0].transform, {
		cx: 250,
		cy: 250,
		scaleX: 310,
		scaleY: 310,
		rotationDeg: 0
	});
	assert.deepEqual(restored.placements[0].baseStrokes, [[{ x: 0, y: 0.5 }]]);
});

test('cutRingGap opens a top gap in a sealed ring and spares other marks', () => {
	const ring = circleStroke('ring', 500, 500, 300);
	const sigil = circleStroke('sigil', 500, 500, 80);
	const cut = cutRingGap([ring, sigil], { center: { x: 500, y: 500 }, radius: 300 });

	const sigilStrokes = cut.filter((stroke) => stroke.id.startsWith('sigil'));
	assert.equal(sigilStrokes.length, 1);
	assert.equal(sigilStrokes[0].points.length, sigil.points.length);

	const ringStrokes = cut.filter((stroke) => stroke.id.startsWith('ring'));
	assert.ok(ringStrokes.length >= 1);
	for (const stroke of ringStrokes) {
		for (const point of stroke.points) {
			const deg = (Math.atan2(point.y - 500, point.x - 500) * 180) / Math.PI;
			const distFromTop = Math.abs(((deg + 90 + 540) % 360) - 180);
			assert.ok(distFromTop >= 22, `point at ${deg.toFixed(1)}deg sits inside the gap`);
		}
	}
	const coverage = angularCoverage(ringStrokes, 500, 500);
	assert.ok(coverage > 280 && coverage < 330, `coverage ${coverage} should be about 315deg`);
});

test('cutRingGap keeps a small sign sitting on the ring band', () => {
	// A short arc on the band near the top, like a sign stamped onto the ring.
	const sign = circleStroke('sign', 500, 500, 300, -110, -70, 2);
	const cut = cutRingGap([sign], { center: { x: 500, y: 500 }, radius: 300 });
	assert.equal(cut.length, 1);
	assert.equal(cut[0].points.length, sign.points.length);
});

test('cutRingGap handles a wobbly hand-drawn ring inside the band', () => {
	const wobbly = circleStroke(
		'ring',
		500,
		500,
		(deg) => 300 + 40 * Math.sin((deg * 5 * Math.PI) / 180)
	);
	const cut = cutRingGap([wobbly], { center: { x: 500, y: 500 }, radius: 300 });
	const coverage = angularCoverage(cut, 500, 500);
	assert.ok(coverage < 330, `expected a gap, coverage ${coverage}`);
});

test('serializing a sealed drawing stores an unsealed preset', () => {
	const drawing: SpellDrawing = {
		strokes: [circleStroke('ring', 500, 500, 300), circleStroke('sigil', 500, 500, 80)],
		placements: []
	};
	const preset = serializeSpellPreset(drawing, CANVAS, sealedRing());
	const restored = deserializeSpellPreset(preset, CANVAS);
	const ringPieces = restored.strokes.filter((stroke) =>
		stroke.points.every((point) => Math.hypot(point.x - 500, point.y - 500) > 240)
	);
	assert.ok(ringPieces.length >= 1);
	const coverage = angularCoverage(ringPieces, 500, 500);
	assert.ok(coverage < 330, `restored ring coverage ${coverage} should keep the gap`);
});

test('serializing an open drawing never cuts', () => {
	const openRing = circleStroke('ring', 500, 500, 300, -45, 270);
	const preset = serializeSpellPreset({ strokes: [openRing], placements: [] }, CANVAS, {
		found: true,
		complete: false,
		center: { x: 500, y: 500 },
		radius: 300
	});
	assert.equal(preset.strokes.length, 1);
	assert.equal(preset.strokes[0].points.length, openRing.points.length);
});

test('schema rejects invalid payloads', () => {
	assert.equal(
		SpellPresetDataSchema.safeParse({ v: 1, strokes: [], placements: [] }).success,
		false
	);
	assert.equal(
		SpellPresetDataSchema.safeParse({
			v: 1,
			strokes: [{ points: [{ x: Number.NaN, y: 0 }] }],
			placements: []
		}).success,
		false
	);
	assert.equal(
		SpellPresetDataSchema.safeParse({
			v: 2,
			strokes: [{ points: [{ x: 0.5, y: 0.5 }] }],
			placements: []
		}).success,
		false
	);
	assert.equal(
		SpellPresetDataSchema.safeParse({
			v: 1,
			strokes: [{ points: [{ x: 0.5, y: 0.5 }] }],
			placements: [
				{
					kind: 'sigil',
					sourceId: 'fire',
					baseStrokes: [[{ x: 0.5, y: 0.5 }]],
					transform: { cx: 0.5, cy: 0.5, scaleX: 0, scaleY: 0.2, rotationDeg: 0 }
				}
			]
		}).success,
		false
	);
});

test('deserialize rejects unknown versions and bad sizes', () => {
	const preset = serializeSpellPreset(
		{ strokes: [{ id: 's1', points: [{ x: 1, y: 1 }] }], placements: [] },
		CANVAS,
		null
	);
	assert.throws(() => deserializeSpellPreset({ ...preset, v: 2 as never }, CANVAS));
	assert.throws(() => deserializeSpellPreset(preset, 0));
	assert.throws(() => serializeSpellPreset({ strokes: [], placements: [] }, Number.NaN, null));
});
