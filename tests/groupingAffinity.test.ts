import assert from 'node:assert/strict';
import test from 'node:test';

import { CONFIG } from '../src/lib/config.js';
import { strokeAffinity } from '../src/lib/parser/grouping/affinity.js';
import { pointDistance } from '../src/lib/parser/grouping/proximity.js';
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

test('touching strokes share full affinity when one endpoint lands on another stroke segment', () => {
	const vertical = cleanedStroke('vertical', [
		{ x: 0, y: 0 },
		{ x: 0, y: 100 }
	]);
	const bar = cleanedStroke('bar', [
		{ x: -60, y: 50 },
		{ x: 0, y: 50 }
	]);

	assert.equal(pointDistance(vertical, bar), 0);
	assert.equal(strokeAffinity(vertical, bar, ring, CONFIG), 1);
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

test('touching strokes keep full affinity across layer bands', () => {
	const centerFragment = cleanedStroke('center-fragment', [
		{ x: 0, y: 10 },
		{ x: 0, y: 30 }
	]);
	const middleFragment = cleanedStroke('middle-fragment', [
		{ x: 0, y: 30 },
		{ x: 0, y: 90 }
	]);

	assert.equal(strokeAffinity(centerFragment, middleFragment, ring, CONFIG), 1);
});

test('affinity fades with the ink gap and is gone past the reach', () => {
	const stem = cleanedStroke('stem', [
		{ x: 0, y: 60 },
		{ x: 0, y: 90 }
	]);
	const near = cleanedStroke('near', [
		{ x: 5, y: 60 },
		{ x: 30, y: 60 }
	]);
	const far = cleanedStroke('far', [
		{ x: 60, y: 60 },
		{ x: 90, y: 60 }
	]);

	const nearAffinity = strokeAffinity(stem, near, ring, CONFIG);
	assert.ok(nearAffinity > 0.5 && nearAffinity < 1, `near affinity ${nearAffinity}`);
	assert.equal(strokeAffinity(stem, far, ring, CONFIG), 0);
});

test('a dot inside a stroke footprint shares strong affinity with it', () => {
	const spiral = cleanedStroke('spiral', [
		{ x: 40, y: -40 },
		{ x: 80, y: -40 },
		{ x: 80, y: 0 },
		{ x: 40, y: 0 },
		{ x: 40, y: -40 }
	]);
	const dot = cleanedStroke('dot', [
		{ x: 60, y: -20 },
		{ x: 61, y: -21 }
	]);

	assert.ok(strokeAffinity(spiral, dot, ring, CONFIG) >= 0.85);
});
