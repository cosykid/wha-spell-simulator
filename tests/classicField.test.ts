/**
 * `buildSpellField(reading)` — the classic engine's adapter from the gated seal
 * reading to its own force field. One test per operator family, plus the
 * `facingClass` to spawn-domain table the region signs resolve through.
 *
 * The field itself is preserved behavior restored from `b439a01`; what is new,
 * and what these tests are for, is that it now reads a `SealReading` where it
 * used to read raw `Recognition`.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
	buildSpellField,
	emptySpellField,
	spellFieldSignature
} from '../src/lib/cast/classic/field/buildSpellField.js';
import { facingFromTwist } from '../src/lib/compiler/reading/facing.js';
import { vectorFromAngleDeg } from '../src/lib/utils/geometry.js';
import type { FacingClass, SealReading, SignReading } from '../src/lib/types.js';
import type {
	AxialSource,
	BuoyancySource,
	DirectedSource,
	RadialSource
} from '../src/lib/cast/classic/field/spellField.js';

/**
 * One read sign, built the way `readSeal` builds them: the position is the ring
 * bearing at `radius`, and the facing is inward rotated by `twistDeg`.
 */
function sign(options: {
	id?: string;
	manifestation: string;
	bearingDeg: number;
	twistDeg?: number;
	radius?: number;
	power?: number;
	facingClass?: FacingClass;
}): SignReading {
	const twistDeg = options.twistDeg ?? 0;
	const radius = options.radius ?? 0.85;
	const radial = vectorFromAngleDeg(options.bearingDeg);
	return {
		id: options.id ?? options.manifestation,
		manifestation: options.manifestation,
		at: { x: radial.x * radius, y: radial.y * radius },
		length: 0.4,
		facing: facingFromTwist(options.bearingDeg, twistDeg),
		facingClass: options.facingClass ?? 'inward',
		facingSource: 'ml-pose',
		facingTrust: 0.9,
		power: options.power ?? 0.7
	};
}

function reading(signs: SignReading[]): SealReading {
	return { signs, sigil: 'fire', element: 'fire', quality: 0.8, symmetry: null, notes: [] };
}

test('a column becomes an axial beam leaning toward its own ring position', () => {
	const at = { x: 0, y: 0.85 };
	const field = buildSpellField(reading([sign({ manifestation: 'column', bearingDeg: 270 })]));

	assert.equal(field.sources.length, 1);
	const source = field.sources[0] as AxialSource;
	assert.equal(source.kind, 'axial');
	assert.ok(Math.abs(source.at.x - at.x) < 1e-9);
	assert.ok(Math.abs(source.at.y - at.y) < 1e-9);
	assert.equal(source.strength, 0.7);
});

test('a column facing clearly outward inverts into an outward radial', () => {
	const field = buildSpellField(
		reading([sign({ manifestation: 'column', bearingDeg: 270, twistDeg: 180 })])
	);

	const source = field.sources[0] as RadialSource;
	assert.equal(source.kind, 'radial');
	assert.equal(source.twistDeg, 180);
});

test('a pull carries its own twist, read back off the facing vector', () => {
	for (const twistDeg of [0, 45, -45, 90, -90, 135]) {
		const field = buildSpellField(
			reading([sign({ manifestation: 'pull', bearingDeg: 30, twistDeg })])
		);
		const source = field.sources[0] as RadialSource;
		assert.equal(source.kind, 'radial');
		assert.ok(
			Math.abs(source.twistDeg - twistDeg) < 1e-6,
			`twist ${twistDeg} read back as ${source.twistDeg}`
		);
	}
});

test('dispersion pushes out and collection pulls straight in, whatever they face', () => {
	const field = buildSpellField(
		reading([
			sign({ id: 'dispersion', manifestation: 'dispersion', bearingDeg: 0, twistDeg: 70 }),
			sign({ id: 'collection', manifestation: 'collection', bearingDeg: 180, twistDeg: 70 })
		])
	);

	const twists = field.sources.map((source) => (source as RadialSource).twistDeg);
	assert.deepEqual(
		twists.sort((a, b) => a - b),
		[0, 180]
	);
});

test('convergence signs collapse into one attractor at their weighted side', () => {
	const field = buildSpellField(
		reading([
			sign({ id: 'a', manifestation: 'convergence', bearingDeg: 0, radius: 1, power: 0.5 }),
			sign({ id: 'b', manifestation: 'convergence', bearingDeg: 0, radius: 0.6, power: 0.5 })
		])
	);

	assert.equal(field.sources.length, 1);
	const source = field.sources[0] as RadialSource;
	assert.equal(source.sign, 'convergence');
	assert.equal(source.twistDeg, 0);
	// Mean radius 0.8 along +x, scaled by the 0.42 focus factor.
	assert.ok(Math.abs(source.center.x - 0.8 * 0.42) < 1e-9);
	assert.ok(Math.abs(source.center.y) < 1e-9);
});

test('levitation becomes buoyancy pressing inward from where the sign sits', () => {
	const field = buildSpellField(
		reading([sign({ manifestation: 'levitation', bearingDeg: 90, power: 0.4 })])
	);

	const source = field.sources[0] as BuoyancySource;
	assert.equal(source.kind, 'buoyancy');
	assert.equal(source.strength, 0.4);
	assert.ok(source.at.y < 0, 'bearing 90 is above the ring center in screen coordinates');
});

test("a region sign jets along the reading's facing, not along its own bearing", () => {
	const field = buildSpellField(
		reading([sign({ manifestation: 'directed', bearingDeg: 270, twistDeg: 90 })])
	);

	const source = field.sources[0] as DirectedSource;
	assert.equal(source.kind, 'directed');
	// Bottom of the ring, twisted a quarter turn: the jet runs sideways, not up.
	assert.ok(Math.abs(source.direction.y) < 1e-6);
	assert.ok(Math.abs(Math.abs(source.direction.x) - 1) < 1e-6);
});

test('an unmodelled manifestation contributes no source at all', () => {
	const field = buildSpellField(reading([sign({ manifestation: 'crush', bearingDeg: 10 })]));

	assert.deepEqual(field, emptySpellField());
});

test('facingClass picks the spawn domain, and only region signs vote', () => {
	const domainFor = (classes: FacingClass[]) =>
		buildSpellField(
			reading(
				classes.map((facingClass, index) =>
					sign({
						id: `region-${index}`,
						manifestation: 'directed',
						bearingDeg: index * 90,
						// The facing has to agree with the class, or coherence disagrees with it.
						twistDeg: facingClass === 'outward' ? 180 : facingClass === 'inward' ? 0 : 90,
						facingClass
					})
				)
			)
		).domain.mode;

	assert.equal(domainFor(['inward', 'outward']), 'ring', 'opposed pairs pin it onto the ring');
	assert.equal(domainFor(['inward', 'inward', 'inward', 'inward']), 'inside');
	assert.equal(domainFor(['outward', 'outward', 'outward', 'outward']), 'outside');
	assert.equal(
		domainFor(['tangential-cw', 'tangential-cw', 'tangential-cw', 'tangential-cw']),
		'anywhere',
		'tangential arrangements have no net side'
	);
});

test('region signs agreeing on one absolute side emit a sector toward it', () => {
	const field = buildSpellField(
		reading([
			// Two signs on opposite rims both facing screen-left: they agree with each
			// other rather than with the radial axis.
			sign({
				id: 'a',
				manifestation: 'directed',
				bearingDeg: 0,
				twistDeg: 0,
				facingClass: 'inward'
			}),
			sign({
				id: 'b',
				manifestation: 'directed',
				bearingDeg: 20,
				twistDeg: 20,
				facingClass: 'inward'
			})
		])
	);

	assert.equal(field.domain.mode, 'sector');
	assert.ok(field.domain.direction, 'a sector carries the side it emits toward');
});

test('a sign with no radial arm reads no twist rather than a garbage one', () => {
	const centered = sign({ manifestation: 'pull', bearingDeg: 45, twistDeg: 90, radius: 0 });
	const field = buildSpellField(reading([centered]));

	assert.equal((field.sources[0] as RadialSource).twistDeg, 0);
});

test('the signature moves when a source does and holds when nothing did', () => {
	const one = buildSpellField(reading([sign({ manifestation: 'column', bearingDeg: 270 })]));
	const same = buildSpellField(reading([sign({ manifestation: 'column', bearingDeg: 270 })]));
	const moved = buildSpellField(reading([sign({ manifestation: 'column', bearingDeg: 90 })]));

	assert.equal(spellFieldSignature(one), spellFieldSignature(same));
	assert.notEqual(spellFieldSignature(one), spellFieldSignature(moved));
});

test('a sign-free reading builds the empty field', () => {
	assert.deepEqual(buildSpellField(reading([])), emptySpellField());
});
