import assert from 'node:assert/strict';
import test from 'node:test';

import {
	pointCloudDistanceForStrokes,
	renderInkDistanceMap,
	scoreChamferDistance
} from '../src/lib/parser/shape-matcher/index.js';
import type { Point } from '../src/lib/types.js';

function line(points: Point[]): Point[][] {
	return [points];
}

const vertical = line([
	{ x: 10, y: 10 },
	{ x: 10, y: 110 }
]);

const horizontal = line([
	{ x: 10, y: 10 },
	{ x: 110, y: 10 }
]);

const column = [
	[
		{ x: 50, y: 10 },
		{ x: 50, y: 90 }
	],
	[
		{ x: 20, y: 90 },
		{ x: 80, y: 90 }
	]
];

const columnReordered = [column[1], column[0]];

test('$P point cloud matches the same template at different scales', () => {
	const scaled = line([
		{ x: 200, y: 100 },
		{ x: 200, y: 500 }
	]);

	assert.ok(pointCloudDistanceForStrokes(vertical, scaled) < 0.03);
});

test('$P point cloud tolerates small point jitter', () => {
	const jittered = line([
		{ x: 12, y: 9 },
		{ x: 9, y: 62 },
		{ x: 11, y: 112 }
	]);

	assert.ok(pointCloudDistanceForStrokes(vertical, jittered) < 0.06);
});

test('$P point cloud gives unrelated symbols a high distance', () => {
	assert.ok(pointCloudDistanceForStrokes(vertical, horizontal) > 0.5);
});

test('$P point cloud handles multi-stroke symbols when stroke order differs', () => {
	assert.ok(pointCloudDistanceForStrokes(column, columnReordered) < 0.03);
});

test('chamfer distance scores small shape jitter well', () => {
	const jittered = [
		[
			{ x: 52, y: 12 },
			{ x: 49, y: 88 }
		],
		[
			{ x: 22, y: 91 },
			{ x: 82, y: 88 }
		]
	];
	const score = scoreChamferDistance(renderInkDistanceMap(jittered), renderInkDistanceMap(column));

	assert.ok(score.chamferScore > 0.8);
	assert.ok(score.candidateExplainedRatio > 0.9);
});

test('chamfer coverage drops when required ink is missing', () => {
	const score = scoreChamferDistance(
		renderInkDistanceMap([column[0]]),
		renderInkDistanceMap(column)
	);

	assert.ok(score.templateCoveredRatio < 0.75);
	assert.ok(score.missingInkRatio > 0.25);
});

test('chamfer contamination rises when extra ink is unrelated', () => {
	const contaminated = [
		...column,
		[
			{ x: 130, y: 10 },
			{ x: 130, y: 90 }
		]
	];
	const score = scoreChamferDistance(
		renderInkDistanceMap(contaminated),
		renderInkDistanceMap(column)
	);

	assert.ok(score.unexplainedInkRatio > 0.35);
	assert.ok(score.contaminationRisk > 0.4);
});
