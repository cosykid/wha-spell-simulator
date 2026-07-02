import assert from 'node:assert/strict';
import test from 'node:test';

import { CONFIG } from '../src/lib/config.js';
import {
	buildShapeLibrary,
	defaultTransformForShape,
	offsetTransformForPaste
} from '../src/lib/input/shapeLibrary.js';
import { bakePlacementToStrokes, createPlacementPointMapper } from '../src/lib/input/shapeBaker.js';
import { classifyDrawing } from '../src/lib/parser/classifier/index.js';
import { compileSpell } from '../src/lib/compiler/spellBuilder.js';
import type { Placement, Point, ShapeItem, Stroke, Vector } from '../src/lib/types.js';
import { readRealDictionary } from './dictionaryFixtures.js';

const dictionary = readRealDictionary();

const library = buildShapeLibrary(dictionary);
const paperSize = 800;
const center: Vector = { x: 600, y: 400 };

function place(
	id: string,
	item: ShapeItem,
	point: Vector,
	overrides: Partial<Placement['transform']> = {}
): Placement {
	return {
		id,
		kind: item.kind,
		sourceId: item.sourceId,
		baseStrokes: item.baseStrokes,
		transform: { ...defaultTransformForShape(item, point, paperSize), ...overrides }
	};
}

function arcStroke(
	centerPoint: Vector,
	radius: number,
	startDeg: number,
	endDeg: number,
	steps = 16
): Stroke {
	const points: Point[] = [];
	for (let index = 0; index <= steps; index += 1) {
		const angle = ((startDeg + ((endDeg - startDeg) * index) / steps) * Math.PI) / 180;
		points.push({
			x: centerPoint.x + Math.cos(angle) * radius,
			y: centerPoint.y + Math.sin(angle) * radius
		});
	}
	return { id: 'close', points, startedAt: 0, endedAt: 0 };
}

function compile(strokes: Stroke[]) {
	const pipeline = classifyDrawing({ strokes, previousRing: null, dictionary, config: CONFIG });
	return { pipeline, spellIR: compileSpell({ glyphAST: pipeline.glyphAST, config: CONFIG }) };
}

function compileFromPlacements(placements: Placement[], extraStrokes: Stroke[] = []) {
	return compile([...placements.flatMap(bakePlacementToStrokes), ...extraStrokes]);
}

test('a baked ring is detected as a prepared, not yet sealed, boundary', () => {
	const { pipeline } = compileFromPlacements([place('p1', library.ring, center)]);
	assert.equal(pipeline.ring.found, true);
	assert.equal(pipeline.ring.complete, false);
});

test('placement point transform matches baked recognition strokes', () => {
	const placement = place('p1', library.ring, center, {
		scaleX: 420,
		scaleY: 260,
		rotationDeg: 37
	});
	const baked = bakePlacementToStrokes(placement);
	const toCanvas = createPlacementPointMapper(placement.transform);

	for (const [strokeIndex, sourceStroke] of placement.baseStrokes.entries()) {
		for (const [pointIndex, sourcePoint] of sourceStroke.entries()) {
			const rendered = toCanvas(sourcePoint);
			const recognized = baked[strokeIndex]!.points[pointIndex]!;

			assert.equal(rendered.x, recognized.x);
			assert.equal(rendered.y, recognized.y);
		}
	}
});

test('a baked ring with a baked fire sigil compiles to a prepared fire spell', () => {
	const fire = library.sigils.find((item) => item.sourceId === 'fire');
	assert.ok(fire, 'fire sigil exists in the library');

	const { spellIR } = compileFromPlacements([
		place('p1', library.ring, center),
		place('p2', fire!, center)
	]);

	assert.equal(spellIR.valid, true);
	assert.equal(spellIR.prepared, true);
	assert.equal(spellIR.active, false);
	assert.equal(spellIR.element, 'fire');
});

test('closing the ring gap by hand activates the fire spell', () => {
	const fire = library.sigils.find((item) => item.sourceId === 'fire');
	const ringPlacement = place('p1', library.ring, center);
	const ringRadius = ringPlacement.transform.scaleX / 2;
	const closingStroke = arcStroke(center, ringRadius, -30, 30);

	const { spellIR } = compileFromPlacements(
		[ringPlacement, place('p2', fire!, center)],
		[closingStroke]
	);

	assert.equal(spellIR.active, true);
	assert.equal(spellIR.element, 'fire');
});

test('a pasted copy keeps its size and rotation but shifts off the original', () => {
	const original = { cx: 600, cy: 400, scaleX: 300, scaleY: 200, rotationDeg: 40 };
	const pasted = offsetTransformForPaste(original);

	// Shape and orientation carry over unchanged.
	assert.equal(pasted.scaleX, original.scaleX);
	assert.equal(pasted.scaleY, original.scaleY);
	assert.equal(pasted.rotationDeg, original.rotationDeg);

	// Position shifts so the copy does not hide the original.
	assert.ok(pasted.cx > original.cx);
	assert.ok(pasted.cy > original.cy);
});

test('the paste nudge scales with the shape and cascades on repeat', () => {
	const small = offsetTransformForPaste({ cx: 0, cy: 0, scaleX: 100, scaleY: 100, rotationDeg: 0 });
	const wide = offsetTransformForPaste({ cx: 0, cy: 0, scaleX: 200, scaleY: 100, rotationDeg: 0 });

	// A shape twice as wide is nudged twice as far along x, while the y nudge
	// tracks height, which is unchanged here.
	assert.equal(wide.cx, small.cx * 2);
	assert.equal(wide.cy, small.cy);

	// Feeding a paste back in advances by the same step, so copies cascade.
	const twice = offsetTransformForPaste(small);
	assert.equal(twice.cx - small.cx, small.cx);
	assert.equal(twice.cy - small.cy, small.cy);
});
