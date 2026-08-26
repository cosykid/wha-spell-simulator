/**
 * Law tests for the look table: how a row is resolved, and what the eight
 * material profiles argue about the substances they dress a cell's forms in.
 *
 * The rulings are cited by id from `docs/animation-spec.md`; the rest pin the
 * contracts in `docs/animation-redesign.md` section 5, chief among them that
 * resolution never returns undefined, so no caller ever has cause to branch on
 * element.
 *
 * Drawing itself needs a GPU and belongs to the look golden tier. Everything
 * asserted here is data or a pure function.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { LOOKS, lookFor, lookRow } from '../src/lib/cast/looks/table.js';
import { AEROFORM_LOOKS } from '../src/lib/cast/looks/aeroform.js';
import { CRYSTAL_LOOKS } from '../src/lib/cast/looks/crystal.js';
import { FIRE_LOOKS } from '../src/lib/cast/looks/fire.js';
import { INERT_LOOKS } from '../src/lib/cast/looks/inert.js';
import { EARTH_LOOKS } from '../src/lib/cast/looks/earth.js';
import { LIGHT_LOOKS } from '../src/lib/cast/looks/light.js';
import { WATER_LOOKS } from '../src/lib/cast/looks/water.js';
import { WIND_LOOKS } from '../src/lib/cast/looks/wind.js';
import { SIGIL_OPTIONS } from '../src/lib/ui/spellEffectLab.js';
import type { Look, LookRow, LookTable, MaterialProfile } from '../src/lib/cast/looks/look.js';
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
	body: { ...WIND_LOOKS.body, tint: { core: [1, 2, 3], edge: [4, 5, 6] } }
};
const WITH_SIGIL_ROW: LookTable = { ...LOOKS, 'wind-underfoot': UNDERFOOT_LOOKS };

/** A row's five role looks, without the material profile riding beside them. */
function roleLooks(row: LookRow): Look[] {
	const { material: _, ...roles } = row;
	return Object.values(roles);
}

/** A tint's core-to-edge fall: how hard a role reads as lit rather than colored. */
function fall(look: Look): number {
	return look.tint.core.reduce((total, c, i) => total + Math.abs(c - look.tint.edge[i]), 0) / 3;
}

/** How steeply a whole row falls, averaged over its roles. */
function rowFall(row: LookRow): number {
	const looks = roleLooks(row);
	return looks.reduce((total, look) => total + fall(look), 0) / looks.length;
}

function everyLook(): Look[] {
	return [...Object.values(LOOKS), INERT_LOOKS].flatMap(roleLooks);
}

/** Every row a cast can resolve to, named the way each row's argument is written. */
const EVERY_ROW: LookTable = { ...LOOKS, inert: INERT_LOOKS };

/** The material fields the contract declares as 0..1, so a range law can read them. */
const UNIT_FIELDS = [
	'emissive',
	'opacity',
	'garnishDensity',
	'trailPersistence',
	'flicker',
	'undulation',
	'weight'
] as const satisfies readonly (keyof MaterialProfile)[];

/**
 * Every profile but this row's, so a claim that a row holds the table's maximum
 * or minimum is checked against the whole table rather than against one rival.
 */
function rivalMaterials(row: LookRow): MaterialProfile[] {
	return Object.values(EVERY_ROW)
		.filter((other) => other !== row)
		.map((other) => other.material);
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
	// Crystalline, so cool where earth is warm.
	const [red, , blue] = CRYSTAL_LOOKS.body.tint.core;
	assert.ok(blue > red, 'crystal is the cool reading of earth');
	assert.ok(EARTH_LOOKS.body.tint.core[2] < EARTH_LOOKS.body.tint.core[0]);
	// And the widest core-to-edge fall in the table, which is what makes a facet
	// read as lit rather than as colored.
	for (const [name, row] of Object.entries(EVERY_ROW)) {
		if (row === CRYSTAL_LOOKS) continue;
		assert.ok(rowFall(row) < rowFall(CRYSTAL_LOOKS), `${name} falls as steeply as crystal`);
	}
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
		}
	}
});

test('every look in the table is drawable', () => {
	for (const look of everyLook()) {
		for (const channel of [...look.tint.core, ...look.tint.edge]) {
			assert.ok(
				Number.isInteger(channel) && channel >= 0 && channel <= 255,
				'a tint channel must be a byte `ink.ts` can convert'
			);
		}
	}
});

// ---------------------------------------------------------------------------
// Material profiles: the eight substances the cell stage dresses its forms in
// ---------------------------------------------------------------------------

test('every material profile stays inside the contract its fields declare', () => {
	for (const [name, row] of Object.entries(EVERY_ROW)) {
		const material = row.material;
		for (const field of UNIT_FIELDS) {
			const value = material[field];
			assert.ok(value >= 0 && value <= 1, `${name} ${field} is outside 0..1`);
		}
		assert.ok(Number.isInteger(material.bands) && material.bands >= 0, `${name} bands`);
		assert.ok(material.noiseScale >= 0, `${name} noiseScale`);
		assert.ok(material.ribbonWidth > 0, `${name} has no ribbon to draw`);
	}
});

test('the table reads as eight substances, not one tuned eight ways', () => {
	const rows = Object.entries(EVERY_ROW);
	for (const [name, row] of rows) {
		for (const [rival, other] of rows) {
			if (name >= rival) continue;
			assert.notDeepStrictEqual(
				row.material,
				other.material,
				`${name} and ${rival} are one material`
			);
		}
	}
	// An axis every row sits at the same end of separates nothing, so each one
	// has to be spent: the extremes of every 0..1 field are half the range apart.
	for (const field of UNIT_FIELDS) {
		const values = rows.map(([, row]) => row.material[field]);
		assert.ok(Math.max(...values) - Math.min(...values) >= 0.5, `${field} separates no rows`);
	}
});

test('fire is the flicker row and water is the undulation row', () => {
	// "Creates or manipulates flame and heat": the flame is the half with a
	// shape, and its jitter is what a viewer names it by.
	assert.ok(
		rivalMaterials(FIRE_LOOKS).every((rival) => FIRE_LOOKS.material.flicker > rival.flicker),
		'fire does not flicker hardest'
	);
	assert.equal(FIRE_LOOKS.material.bands, 0, 'a striped flame reads as cloth');
	// Water spells "often collect existing water", so this row is a substance
	// that swells and rolls. Water that strobes stops being water.
	assert.equal(WATER_LOOKS.material.flicker, 0);
	assert.ok(FIRE_LOOKS.material.flicker > WATER_LOOKS.material.flicker);
	assert.ok(
		rivalMaterials(WATER_LOOKS).every(
			(rival) => WATER_LOOKS.material.undulation > rival.undulation
		),
		'water does not undulate most'
	);
	assert.ok(WATER_LOOKS.material.bands > FIRE_LOOKS.material.bands, 'a flow shows its phase');
});

test('fire and light are the only self-lit rows, and light is the pure one', () => {
	assert.equal(FIRE_LOOKS.material.emissive, 1);
	assert.equal(LIGHT_LOOKS.material.emissive, 1);
	for (const [name, row] of Object.entries(EVERY_ROW)) {
		if (row === FIRE_LOOKS || row === LIGHT_LOOKS) continue;
		assert.ok(row.material.emissive < 1, `${name} is a light source`);
	}
	// "A variant of the fire sigil" that "manifests as light rather than ordinary
	// flame": light keeps fire's emission and drops fire's texture.
	assert.equal(LIGHT_LOOKS.material.noiseScale, 0, 'light is the one unbroken surface');
	assert.ok(
		rivalMaterials(LIGHT_LOOKS).every((rival) => rival.noiseScale > 0),
		'another row also refuses to break up'
	);
	assert.equal(LIGHT_LOOKS.material.edge, 'crisp');
	assert.ok(LIGHT_LOOKS.material.flicker < FIRE_LOOKS.material.flicker);
	assert.ok(
		rivalMaterials(LIGHT_LOOKS).every((rival) => LIGHT_LOOKS.material.weight < rival.weight),
		'light has no body to accelerate'
	);
});

test('earth is the heaviest matter and wind is the thinnest path', () => {
	// "Manipulates solid materials such as stone, sand, soil, and wood": matter
	// first and light barely at all, which is what the `source-over` roles say.
	assert.equal(EARTH_LOOKS.material.opacity, 1);
	assert.equal(EARTH_LOOKS.material.weight, 1);
	for (const rival of rivalMaterials(EARTH_LOOKS)) {
		assert.ok(rival.weight < EARTH_LOOKS.material.weight, 'a row is as heavy as earth');
		assert.ok(rival.opacity < EARTH_LOOKS.material.opacity, 'a row fills as solidly as earth');
	}
	assert.ok(EARTH_LOOKS.material.emissive < WATER_LOOKS.material.emissive);
	assert.equal(EARTH_LOOKS.material.bands, 0, 'nothing in an earth form is flowing');
	// "Moves and manipulates air" and creates none, so the row is a path taken
	// and not a thing made: nearly no fill, and the afterimage does the drawing.
	for (const rival of rivalMaterials(WIND_LOOKS)) {
		assert.ok(rival.opacity > WIND_LOOKS.material.opacity, 'a row is as empty as wind');
		assert.ok(rival.ribbonWidth > WIND_LOOKS.material.ribbonWidth, 'a row is as thin as wind');
		assert.ok(
			rival.trailPersistence < WIND_LOOKS.material.trailPersistence,
			'a row smears as long as wind'
		);
	}
});

test('crystal is faceted where earth is a mass', () => {
	// "Creates and manipulates crystalline objects": the object occludes nearly
	// as hard as earth, and everything else parts company with it.
	assert.ok(CRYSTAL_LOOKS.material.opacity < EARTH_LOOKS.material.opacity);
	assert.ok(CRYSTAL_LOOKS.material.weight < EARTH_LOOKS.material.weight);
	assert.ok(CRYSTAL_LOOKS.material.emissive > EARTH_LOOKS.material.emissive);
	assert.equal(CRYSTAL_LOOKS.material.edge, 'serrated');
	// A lattice that waves is not a lattice, and a facet either catches the light
	// or it does not, so this row is the still one that blinks hardest.
	assert.equal(CRYSTAL_LOOKS.material.undulation, 0);
	assert.ok(
		rivalMaterials(CRYSTAL_LOOKS).every((rival) => rival.undulation > 0),
		'another row is as rigid as crystal'
	);
	assert.ok(CRYSTAL_LOOKS.material.flicker > EARTH_LOOKS.material.flicker);
	assert.ok(CRYSTAL_LOOKS.material.flicker < FIRE_LOOKS.material.flicker, 'a glint is not a flame');
	// A clod smears and a shard does not, said where the cell stage can read it.
	assert.ok(
		rivalMaterials(CRYSTAL_LOOKS).every(
			(rival) => rival.trailPersistence > CRYSTAL_LOOKS.material.trailPersistence
		),
		'a row leaves as little afterimage as crystal'
	);
});

test('aeroform is wind read as a volume rather than as a path', () => {
	// "Creates and manipulates air, but does not itself move that air." The tints
	// part company with wind first: this row never goes as deep, and its
	// core-to-edge fall is the shallowest in the table, a shallow fall being what
	// makes a mass read as soft rather than as a lit edge.
	for (const [name, row] of Object.entries(EVERY_ROW)) {
		if (row === AEROFORM_LOOKS) continue;
		assert.ok(rowFall(row) > rowFall(AEROFORM_LOOKS), `${name} falls as gently as aeroform`);
	}
	assert.ok(
		rivalMaterials(AEROFORM_LOOKS).every(
			(rival) => rival.ribbonWidth < AEROFORM_LOOKS.material.ribbonWidth
		),
		'a row is as wide as aeroform'
	);
	assert.ok(AEROFORM_LOOKS.material.opacity > WIND_LOOKS.material.opacity);
	assert.ok(AEROFORM_LOOKS.material.weight > WIND_LOOKS.material.weight);
	// Everything that made wind read as a path comes back down, and the slow
	// swell of air that was made rather than moved is what is left.
	assert.ok(AEROFORM_LOOKS.material.flicker < WIND_LOOKS.material.flicker);
	assert.ok(AEROFORM_LOOKS.material.noiseScale < WIND_LOOKS.material.noiseScale);
	assert.ok(AEROFORM_LOOKS.material.trailPersistence < WIND_LOOKS.material.trailPersistence);
	assert.ok(AEROFORM_LOOKS.material.undulation > WIND_LOOKS.material.undulation);
});

test('R-11: the inert row is the faintest one, and its motion still reads', () => {
	for (const rival of rivalMaterials(INERT_LOOKS)) {
		assert.ok(rival.emissive > INERT_LOOKS.material.emissive, 'a row is as dim as inert');
		assert.ok(rival.garnishDensity > INERT_LOOKS.material.garnishDensity, 'a row throws as little');
	}
	// Faint is not absent. A seal that manifests nothing still has to show that
	// something happened, so the afterimage outlasts every row that is matter.
	for (const row of [WATER_LOOKS, EARTH_LOOKS, CRYSTAL_LOOKS]) {
		assert.ok(INERT_LOOKS.material.trailPersistence > row.material.trailPersistence);
	}
});
