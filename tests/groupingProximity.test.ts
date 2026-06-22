import assert from 'node:assert/strict';
import test from 'node:test';

import { CONFIG } from '../src/lib/config.js';
import { mergeFragmentGroups } from '../src/lib/parser/grouping/decomposition.js';
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

test('long stroke sampling preserves endpoint contact', () => {
	const vertical = cleanedStroke(
		'vertical',
		Array.from({ length: 57 }, (_, index) => ({
			x: 0,
			y: (100 * index) / 56
		}))
	);
	const bar = cleanedStroke('bar', [
		{ x: 0, y: 100 },
		{ x: 50, y: 100 }
	]);

	assert.equal(pointDistance(vertical, bar), 0);
});

test('touching fragment groups merge even when they cross layer bands', () => {
	const centerFragment = cleanedStroke('center-fragment', [
		{ x: 0, y: 10 },
		{ x: 0, y: 30 }
	]);
	const middleFragment = cleanedStroke('middle-fragment', [
		{ x: 0, y: 30 },
		{ x: 0, y: 90 }
	]);

	const merged = mergeFragmentGroups([[centerFragment], [middleFragment]], ring, CONFIG);

	assert.equal(merged.length, 1);
	assert.deepEqual(
		new Set(merged[0].map((stroke) => stroke.id)),
		new Set(['center-fragment', 'middle-fragment'])
	);
});
