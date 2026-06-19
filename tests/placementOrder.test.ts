import assert from 'node:assert/strict';
import test from 'node:test';

import { placementsInRenderOrder } from '../src/lib/ui/simulator/placement-order.js';
import type { Placement, PlacementKind } from '../src/lib/types.js';

function placement(id: string, kind: PlacementKind): Placement {
	return {
		id,
		kind,
		sourceId: kind,
		baseStrokes: [],
		transform: { cx: 0, cy: 0, scaleX: 100, scaleY: 100, rotationDeg: 0 }
	};
}

test('rings are ordered beneath sigils and signs', () => {
	const ordered = placementsInRenderOrder([
		placement('sign1', 'sign'),
		placement('ring1', 'ring'),
		placement('sigil1', 'sigil')
	]);
	assert.deepEqual(
		ordered.map((p) => p.id),
		['ring1', 'sign1', 'sigil1']
	);
});

test('placement order is otherwise stable within and across kinds', () => {
	const ordered = placementsInRenderOrder([
		placement('sigil1', 'sigil'),
		placement('ring1', 'ring'),
		placement('sign1', 'sign'),
		placement('ring2', 'ring'),
		placement('sigil2', 'sigil')
	]);
	assert.deepEqual(
		ordered.map((p) => p.id),
		['ring1', 'ring2', 'sigil1', 'sign1', 'sigil2']
	);
});

test('does not mutate the input array', () => {
	const input = [placement('sigil1', 'sigil'), placement('ring1', 'ring')];
	placementsInRenderOrder(input);
	assert.deepEqual(
		input.map((p) => p.id),
		['sigil1', 'ring1']
	);
});
