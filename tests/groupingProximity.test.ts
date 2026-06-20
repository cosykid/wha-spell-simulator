import assert from 'node:assert/strict';
import test from 'node:test';

import { groupsTouch, pointDistance } from '../src/lib/parser/grouping/proximity.js';
import { boundsForPoints, pathLength } from '../src/lib/utils/geometry.js';
import type { CleanedStroke, Point, RingInfo } from '../src/lib/types.js';

const ring: RingInfo = {
	found: true,
	center: { x: 0, y: 0 },
	radius: 100
};

function cleanedStroke(id: string, points: Point[]): CleanedStroke {
	return {
		id,
		points,
		metrics: {
			length: pathLength(points),
			bounds: boundsForPoints(points),
			pointCount: points.length
		}
	};
}

test('touching strokes group when one endpoint lands on another stroke segment', () => {
	const vertical = cleanedStroke('vertical', [
		{ x: 0, y: 0 },
		{ x: 0, y: 100 }
	]);
	const bar = cleanedStroke('bar', [
		{ x: -60, y: 50 },
		{ x: 0, y: 50 }
	]);

	assert.equal(pointDistance(vertical, bar), 0);
	assert.equal(groupsTouch([vertical], [bar], ring), true);
});
