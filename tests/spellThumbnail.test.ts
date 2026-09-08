import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSpellThumbnail } from '../src/lib/structures/spellThumbnail.js';
import { SPELL_PRESET_VERSION, type SpellPresetData } from '../src/lib/structures/spellPreset.js';
import { simplifyPath } from '../src/lib/utils/simplifyPath.js';
import type { Vector } from '../src/lib/types.js';

function circlePoints(count: number, radius = 0.3, center = 0.5): { x: number; y: number }[] {
	return Array.from({ length: count }, (_, index) => {
		const angle = (index / (count - 1)) * Math.PI * 2;
		return { x: center + Math.cos(angle) * radius, y: center + Math.sin(angle) * radius };
	});
}

function preset(strokes: { x: number; y: number }[][]): SpellPresetData {
	return {
		v: SPELL_PRESET_VERSION,
		strokes: strokes.map((points) => ({ points })),
		placements: []
	};
}

/** Every point of a polyline string, back as numbers. */
function pointsOf(polyline: string): Vector[] {
	return polyline.split(' ').map((pair) => {
		const [x, y] = pair.split(',').map(Number);
		return { x, y };
	});
}

test('simplifyPath keeps the ends and drops what sits on the line between them', () => {
	const straight = [
		{ x: 0, y: 0 },
		{ x: 1, y: 0 },
		{ x: 2, y: 0 },
		{ x: 3, y: 0 }
	];
	assert.deepEqual(simplifyPath(straight, 0.1), [
		{ x: 0, y: 0 },
		{ x: 3, y: 0 }
	]);
});

test('simplifyPath keeps a point that stands further off than the tolerance', () => {
	const kinked = [
		{ x: 0, y: 0 },
		{ x: 1, y: 0.5 },
		{ x: 2, y: 0 }
	];
	assert.equal(simplifyPath(kinked, 0.25).length, 3);
	assert.equal(simplifyPath(kinked, 0.75).length, 2);
});

test('simplifyPath leaves paths too short to thin alone', () => {
	const pair = [
		{ x: 0, y: 0 },
		{ x: 1, y: 1 }
	];
	assert.equal(simplifyPath(pair, 10).length, 2);
	assert.equal(simplifyPath([], 1).length, 0);
});

test('a thumbnail fits the seal into the preview box wherever it was drawn', () => {
	const cornered = preset([circlePoints(64, 0.1, 0.15)]);
	const points = buildSpellThumbnail(cornered).flatMap(pointsOf);

	const xs = points.map((point) => point.x);
	const ys = points.map((point) => point.y);
	// FIT_HALF_EXTENT is 41 either side of the box's center.
	assert.ok(Math.min(...xs) >= 8 && Math.max(...xs) <= 92, 'x stays inside the box');
	assert.ok(Math.min(...ys) >= 8 && Math.max(...ys) <= 92, 'y stays inside the box');
	assert.ok(Math.max(...xs) - Math.min(...xs) > 80, 'a small seal still fills the frame');
});

test('a thumbnail thins a dense stroke without moving it off the drawn shape', () => {
	const dense = preset([circlePoints(400)]);
	const thinned = buildSpellThumbnail(dense);
	const kept = thinned.flatMap(pointsOf);

	assert.equal(thinned.length, 1);
	assert.ok(kept.length < 100, `expected far fewer than 400 points, kept ${kept.length}`);

	// Still a circle: every kept point sits on the same radius from the center.
	const radii = kept.map((point) => Math.hypot(point.x - 50, point.y - 50));
	assert.ok(Math.max(...radii) - Math.min(...radii) < 1, 'the ring stays round');
});

test('a thumbnail is empty rather than throwing when the preset cannot be read', () => {
	const unreadable = { v: 99, strokes: [], placements: [] } as unknown as SpellPresetData;
	assert.deepEqual(buildSpellThumbnail(unreadable), []);
});
