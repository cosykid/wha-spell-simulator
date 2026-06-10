import assert from 'node:assert/strict';
import test from 'node:test';

import { CONFIG } from '../src/lib/config.js';
import { buildShapeLibrary, defaultTransformForShape } from '../src/lib/input/shapeLibrary.js';
import { bakePlacementToStrokes } from '../src/lib/input/shapeBaker.js';
import { classifyDrawing } from '../src/lib/parser/drawingClassifier.js';
import { compileSpell } from '../src/lib/compiler/spellBuilder.js';
import type { Placement, Point, ShapeItem, Stroke, Vector } from '../src/lib/types.js';
import { dictionary } from '../src/lib/dictionary/dictionaryLoader.js';

const library = buildShapeLibrary(dictionary);
const canvas = { width: 1200, height: 800 };
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
		transform: { ...defaultTransformForShape(item, point, canvas), ...overrides }
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
	const ringRadius = (800 * 0.62) / 2;
	const closingStroke = arcStroke(center, ringRadius, -30, 30);

	const { spellIR } = compileFromPlacements(
		[place('p1', library.ring, center), place('p2', fire!, center)],
		[closingStroke]
	);

	assert.equal(spellIR.active, true);
	assert.equal(spellIR.element, 'fire');
});
