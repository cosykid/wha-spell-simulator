/**
 * Law tests for the Paint layer's pure half: how a look is resolved, and the
 * arithmetic the painter turns a parcel into a sprite with.
 *
 * The rulings are cited by id from `docs/animation-spec.md`; the rest pin the
 * contracts in `docs/animation-redesign.md` section 5, chief among them that
 * resolution never returns undefined, so no caller ever has cause to branch on
 * element.
 *
 * Drawing itself needs a canvas and belongs to the look golden tier. Everything
 * asserted here is a pure function.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { LOOKS, lookFor, lookRow } from '../src/lib/cast/looks/table.js';
import { AEROFORM_LOOKS } from '../src/lib/cast/looks/aeroform.js';
import { CRYSTAL_LOOKS } from '../src/lib/cast/looks/crystal.js';
import { INERT_LOOKS } from '../src/lib/cast/looks/inert.js';
import { EARTH_LOOKS } from '../src/lib/cast/looks/earth.js';
import { WIND_LOOKS } from '../src/lib/cast/looks/wind.js';
import {
	depthAttenuation,
	farthestFirst,
	lifeProgress,
	presenceAt,
	sizeAt,
	viewDistanceFor
} from '../src/lib/cast/render/painter2d.js';
import { SIGIL_OPTIONS } from '../src/lib/ui/spellEffectLab.js';
import type { Look, LookRow, LookTable } from '../src/lib/cast/looks/look.js';
import type { ElementId, LookRole } from '../src/lib/types.js';

/** Exhaustive by construction: a sixth `LookRole` stops this object type-checking. */
const EVERY_ROLE: Record<LookRole, true> = {
	core: true,
	body: true,
	wisp: true,
	ember: true,
	skin: true
};
const ROLES = Object.keys(EVERY_ROLE) as LookRole[];

const EVERY_ELEMENT: Record<ElementId, true> = {
	fire: true,
	water: true,
	wind: true,
	earth: true,
	light: true
};
const ELEMENTS = Object.keys(EVERY_ELEMENT) as ElementId[];

/**
 * A row for a sigil the real table has none for, so the precedence seam is
 * exercised on its own rather than through data that could change for art
 * reasons.
 */
const UNDERFOOT_LOOKS: LookRow = {
	...WIND_LOOKS,
	body: { ...WIND_LOOKS.body, sizePx: [3, 4] }
};
const WITH_SIGIL_ROW: LookTable = { ...LOOKS, 'wind-underfoot': UNDERFOOT_LOOKS };

function everyLook(): Look[] {
	return [...Object.values(LOOKS), INERT_LOOKS].flatMap((row) => Object.values(row));
}

/** How heavily a whole row smears, summed over its roles. */
function totalTrailFrames(row: LookRow): number {
	return Object.values(row).reduce((total, look) => total + (look.trail?.frames ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Resolution: sigil, then element, then inert
// ---------------------------------------------------------------------------

test('a sigil row wins over the element row underneath it', () => {
	assert.deepStrictEqual(
		lookFor({ sigil: 'wind-underfoot', element: 'wind' }, 'body', WITH_SIGIL_ROW),
		UNDERFOOT_LOOKS.body
	);
});

test('a sigil with no row of its own falls back to its element', () => {
	assert.deepStrictEqual(lookRow({ sigil: 'wind-underfoot', element: 'wind' }), WIND_LOOKS);
	// The fallback is by row, so an unknown sigil takes the whole element row.
	assert.deepStrictEqual(lookRow({ sigil: 'not-a-sigil', element: 'earth' }), EARTH_LOOKS);
});

test('defect I: crystal and aeroform resolve their own rows rather than their elements', () => {
	assert.deepStrictEqual(lookRow({ sigil: 'crystal', element: 'earth' }), CRYSTAL_LOOKS);
	assert.deepStrictEqual(lookRow({ sigil: 'aeroform', element: 'wind' }), AEROFORM_LOOKS);
	// Resolution picks a whole row, so nothing inherits per field. Every role of
	// both sigils has to stand on its own, and every one of them differs.
	for (const role of ROLES) {
		assert.notDeepStrictEqual(CRYSTAL_LOOKS[role], EARTH_LOOKS[role], `crystal ${role} is earth's`);
		assert.notDeepStrictEqual(AEROFORM_LOOKS[role], WIND_LOOKS[role], `aeroform ${role} is wind's`);
		assert.ok(lookFor({ sigil: 'crystal', element: 'earth' }, role));
		assert.ok(lookFor({ sigil: 'aeroform', element: 'wind' }, role));
	}
});

test('crystal keeps earth matter opaque, and everything else about it is a facet', () => {
	// "Creates and manipulates crystalline objects": objects occlude.
	assert.equal(CRYSTAL_LOOKS.body.blend, 'source-over');
	assert.equal(CRYSTAL_LOOKS.skin.blend, 'source-over');
	// Crystalline, so cool where earth is warm, and specular where earth is round.
	const [red, , blue] = CRYSTAL_LOOKS.body.tint.core;
	assert.ok(blue > red, 'crystal is the cool reading of earth');
	assert.ok(EARTH_LOOKS.body.tint.core[2] < EARTH_LOOKS.body.tint.core[0]);
	assert.equal(CRYSTAL_LOOKS.core.sprite, 'glint');
	// A clod smears and a shard does not, so the whole row carries fewer ghosts
	// than earth's does.
	assert.ok(totalTrailFrames(CRYSTAL_LOOKS) < totalTrailFrames(EARTH_LOOKS));
});

test('aeroform is the volume reading of wind: softer, larger, and it lingers', () => {
	// "Creates and manipulates air, but does not itself move that air."
	for (const role of ROLES) {
		assert.ok(
			AEROFORM_LOOKS[role].stretch < WIND_LOOKS[role].stretch,
			`aeroform ${role} streaks like wind`
		);
		assert.ok(
			AEROFORM_LOOKS[role].sizePx[1] > WIND_LOOKS[role].sizePx[1],
			`aeroform ${role} is no larger than wind`
		);
	}
	// The air it made stays after the gust would have passed. Only the thrown
	// fleck still dies on the wing.
	assert.equal(WIND_LOOKS.body.fade, 'decay');
	assert.equal(AEROFORM_LOOKS.body.fade, 'leak');
	assert.equal(AEROFORM_LOOKS.core.fade, 'leak');
	assert.equal(AEROFORM_LOOKS.ember.fade, 'decay');
});

test('R-11: a seal with no sigil and no element resolves to the inert row, never to nothing', () => {
	assert.deepStrictEqual(lookRow({ sigil: null, element: null }), INERT_LOOKS);
	assert.deepStrictEqual(lookRow({ sigil: 'not-a-sigil', element: null }), INERT_LOOKS);
	for (const role of ROLES) {
		assert.ok(lookFor({ sigil: null, element: null }, role), `inert has no ${role}`);
	}
});

test('every role resolves for every element, and for every sigil the lab offers', () => {
	for (const element of ELEMENTS) {
		for (const role of ROLES) {
			assert.ok(lookFor({ sigil: null, element }, role), `${element} has no ${role}`);
		}
	}
	for (const option of SIGIL_OPTIONS) {
		for (const role of ROLES) {
			const look = lookFor({ sigil: option.id, element: option.element }, role);
			assert.ok(look, `${option.id} has no ${role}`);
			assert.equal(typeof look.sprite, 'string');
		}
	}
});

test('every look in the table is drawable', () => {
	for (const look of everyLook()) {
		const [min, max] = look.sizePx;
		assert.ok(min > 0 && max >= min, 'a look must have a positive, ordered size range');
		assert.ok(look.stretch >= 0, 'stretch elongates, it never mirrors');
		assert.ok(!look.trail || look.trail.frames > 0, 'a trail with no ghosts must be null');
	}
});

// ---------------------------------------------------------------------------
// The painter's arithmetic
// ---------------------------------------------------------------------------

test('a parcel is fully present at birth and gone at retirement', () => {
	assert.equal(lifeProgress({ ageS: 0, lifetimeS: 2 }), 0);
	assert.equal(lifeProgress({ ageS: 1, lifetimeS: 2 }), 0.5);
	// Past its lifetime a parcel is retired, never negatively present.
	assert.equal(lifeProgress({ ageS: 5, lifetimeS: 2 }), 1);
	assert.equal(lifeProgress({ ageS: 1, lifetimeS: 0 }), 1);

	const decaying = LOOKS.fire.body;
	assert.equal(decaying.fade, 'decay');
	assert.equal(presenceAt(decaying, 0), 1);
	assert.equal(presenceAt(decaying, 1), 0);
});

test('size is the look size range lerped by its own fade curve', () => {
	const look = LOOKS.water.body;
	const [min, max] = look.sizePx;
	assert.equal(sizeAt(look, 1), max);
	assert.equal(sizeAt(look, 0), min);
	assert.equal(sizeAt(look, 0.5), (min + max) / 2);
	// A decaying parcel therefore starts big and shrinks as it fades.
	assert.ok(sizeAt(look, presenceAt(look, 0.1)) > sizeAt(look, presenceAt(look, 0.9)));
});

test('depth attenuation shrinks the far side of the seal and enlarges the near', () => {
	const viewDistance = 8;
	const centered = depthAttenuation(0, viewDistance);
	assert.equal(centered, 1);
	// `projectSeal` reports larger depth for farther, so the far rim reads smaller.
	assert.ok(depthAttenuation(0.9, viewDistance) < centered);
	assert.ok(depthAttenuation(-0.9, viewDistance) > centered);
	// A parcel arriving at the camera is clamped rather than divided by zero.
	assert.ok(Number.isFinite(depthAttenuation(-viewDistance, viewDistance)));
	assert.ok(depthAttenuation(-100, viewDistance) <= 1.8);
	assert.ok(depthAttenuation(100, viewDistance) >= 0.4);
});

test('the view distance is the portal own perspective, measured in ring radii', () => {
	// A bigger ring on screen means the viewer is nearer it in seal units.
	const near = viewDistanceFor({ center: { x: 0, y: 0 }, radiusX: 200, radiusY: 88, scaleY: 0.44 });
	const far = viewDistanceFor({ center: { x: 0, y: 0 }, radiusX: 100, radiusY: 44, scaleY: 0.44 });
	assert.ok(far > near);
	assert.ok(near > 1, 'the viewer must stand outside the seal');
});

test('painter order draws the farthest parcel first', () => {
	const sorted = [{ depth: -1 }, { depth: 2 }, { depth: 0.5 }].sort(farthestFirst);
	assert.deepStrictEqual(
		sorted.map((entry) => entry.depth),
		[2, 0.5, -1]
	);
});
