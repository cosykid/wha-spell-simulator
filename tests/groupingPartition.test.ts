import assert from 'node:assert/strict';
import test from 'node:test';

import { affinityComponents, boundedComponents } from '../src/lib/parser/grouping/components.js';
import {
	HypothesisSet,
	proposeByAffinity,
	proposeLeftovers
} from '../src/lib/parser/grouping/hypotheses.js';
import { bestPartition } from '../src/lib/parser/grouping/partition.js';
import type { ComponentContext, ValuedGroup } from '../src/lib/parser/grouping/types.js';
import type { CleanedStroke } from '../src/lib/types.js';

const ringRadius = 100;

function symmetric(size: number, links: Array<[number, number, number]>): number[][] {
	const matrix = Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
	for (const [a, b, affinity] of links) {
		matrix[a][b] = affinity;
		matrix[b][a] = affinity;
	}
	return matrix;
}

/** A stroke standing in for a small box at `x`, wide enough to count as ink. */
function boxStroke(index: number, x: number, width = 10): CleanedStroke {
	const bounds = { minX: x, minY: 0, maxX: x + width, maxY: width, width, height: width };
	return { id: `s${index}`, points: [], metrics: { bounds } } as unknown as CleanedStroke;
}

function group(members: number[], value: number, wholeness = value): ValuedGroup {
	return {
		mask: members.reduce((bits, index) => bits | (1 << index), 0),
		members,
		wholeness,
		value
	};
}

function membersOf(groups: { members: number[] }[]): number[][] {
	return groups.map((item) => item.members).sort((a, b) => a[0] - b[0] || a.length - b.length);
}

test('affinity components link strokes at or above the threshold only', () => {
	const affinity = symmetric(5, [
		[0, 1, 0.9],
		[1, 2, 0.2],
		[3, 4, 0.1]
	]);

	assert.deepEqual(affinityComponents([0, 1, 2, 3, 4], affinity, 0.2), [[0, 1, 2], [3], [4]]);
});

test('bounded components split an oversized component at its weakest links', () => {
	const affinity = symmetric(6, [
		[0, 1, 0.9],
		[1, 2, 0.9],
		[2, 3, 0.3],
		[3, 4, 0.9],
		[4, 5, 0.9]
	]);

	assert.deepEqual(boundedComponents([0, 1, 2, 3, 4, 5], affinity, 0.2, 4), [
		[0, 1, 2],
		[3, 4, 5]
	]);
	assert.deepEqual(boundedComponents([0, 1, 2], affinity, 0.2, 4), [[0, 1, 2]]);
});

test('the hypothesis set rejects repeats and groups too wide to be one symbol', () => {
	const strokes = [boxStroke(0, 0), boxStroke(1, 20), boxStroke(2, 150)];
	const set = new HypothesisSet(strokes, ringRadius);

	assert.ok(set.add([0, 1]));
	assert.equal(set.add([1, 0]), null);
	assert.equal(set.add([0, 2]), null);
	assert.equal(set.add([]), null);
});

test('affinity proposes every stroke and every merge-tree node, in link order', () => {
	const strokes = [boxStroke(0, 0), boxStroke(1, 20), boxStroke(2, 40)];
	const context: ComponentContext = {
		strokes,
		affinity: symmetric(3, [
			[0, 1, 0.9],
			[1, 2, 0.4],
			[0, 2, 0.1]
		]),
		inkShare: [0.4, 0.3, 0.3]
	};
	const proposed = proposeByAffinity(new HypothesisSet(strokes, ringRadius), context);

	assert.deepEqual(membersOf(proposed), [[0], [0, 1], [0, 1, 2], [1], [2]]);
});

test('leftovers propose the component minus one or two clean glyphs', () => {
	const strokes = [0, 1, 2, 3, 4].map((index) => boxStroke(index, index * 12));
	const set = new HypothesisSet(strokes, ringRadius);
	const sign = set.add([0, 1])!;
	const dot = set.add([4])!;

	const added = proposeLeftovers(set, [sign, dot]);

	assert.deepEqual(membersOf(added), [
		[0, 1, 2, 3],
		[2, 3],
		[2, 3, 4]
	]);
	assert.deepEqual(proposeLeftovers(set, [sign, dot]), []);
});

test('the best partition is an exact cover, not the greedy pick of the strongest group', () => {
	const groups = [
		group([0], 0.05),
		group([1], 0.05),
		group([2], 0.05),
		group([3], 0.05),
		group([0, 1], 0.3),
		group([2, 3], 0.3),
		group([1, 2], 0.45)
	];

	assert.deepEqual(membersOf(bestPartition(4, groups)), [
		[0, 1],
		[2, 3]
	]);
});

test('the best partition keeps a whole group when splitting it is worth less', () => {
	const groups = [
		group([0], 0.1),
		group([1], 0.1),
		group([2], 0.1),
		group([0, 1], 0.25),
		group([0, 1, 2], 0.5)
	];

	assert.deepEqual(membersOf(bestPartition(3, groups)), [[0, 1, 2]]);
});
