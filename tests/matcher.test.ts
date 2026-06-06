import assert from 'node:assert/strict';
import test from 'node:test';

import {
	classifyWithKnn,
	pointCloudDistanceForStrokes,
	renderInkDistanceMap,
	scoreChamferDistance,
	type RecognitionExample
} from '../src/lib/parser/shapeMatcher.js';
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

function example(id: string, symbolId: string, strokes: Point[][]): RecognitionExample {
	return {
		id,
		kind: 'sign',
		symbolId,
		strokes,
		source: 'test',
		rotationInvariant: false
	};
}

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

test('kNN nearest examples vote for the correct symbol', () => {
	const result = classifyWithKnn(vertical, [
		example('line-a', 'line', vertical),
		example('column-a', 'column', column)
	]);

	assert.equal(result.winnerId, 'line');
	assert.equal(result.tied, false);
	assert.ok(result.voteConfidence > 0.7);
});

test('kNN reports tied votes when nearest examples are equally close', () => {
	const result = classifyWithKnn(vertical, [
		example('line-a', 'line-a', vertical),
		example('line-b', 'line-b', vertical)
	]);

	assert.equal(result.tied, true);
	assert.equal(result.voteConfidence, 0);
});

test('kNN keeps far examples low confidence', () => {
	const circleish = [
		[
			{ x: 50, y: 0 },
			{ x: 90, y: 20 },
			{ x: 100, y: 60 },
			{ x: 80, y: 100 },
			{ x: 30, y: 100 },
			{ x: 0, y: 60 },
			{ x: 10, y: 20 },
			{ x: 50, y: 0 }
		]
	];
	const result = classifyWithKnn(circleish, [example('line-a', 'line', vertical)]);

	assert.equal(result.winnerId, 'line');
	assert.ok(result.voteConfidence < 0.35);
});
