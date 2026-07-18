import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSimSeal, simSealSignature } from '../src/lib/sim3d/adapter.js';
import { sampleAmbientVelocity, sampleVelocity } from '../src/lib/sim3d/core/field.js';
import { v3 } from '../src/lib/sim3d/core/math2.js';
import { compileSeal } from '../src/lib/sim3d/core/nozzle.js';
import type { SimSeal } from '../src/lib/sim3d/core/model.js';
import type { Recognition } from '../src/lib/types.js';

// Minimal recognized sign: ring position from angleDeg/radiusNorm, facing
// inward (no ML pose), drawn at a typical size with decent quality.
function sign(
	manifestation: string,
	angleDeg: number,
	overrides: Partial<Recognition> = {}
): Recognition {
	return {
		candidateId: 'c1',
		strokeIds: [],
		layer: 'outer',
		nearBoundary: false,
		radiusNorm: 0.8,
		angleDeg,
		sizeNorm: 0.3,
		lengthNorm: 0.2,
		orientationDeg: 0,
		directedOrientationDeg: 0,
		radialFacing: 'inward',
		overdrawAmount: 0,
		neatness: 0.9,
		recognized: true,
		recognitionStatus: 'valid',
		kind: 'sign',
		id: manifestation,
		displayName: manifestation,
		element: null,
		semantic: { manifestation },
		confidence: 0.9,
		...overrides
	} as Recognition;
}

test('balanced inward columns compile to a vertical jet (watershot)', () => {
	const seal = buildSimSeal(
		[sign('column', 0), sign('column', 90), sign('column', 180), sign('column', 270)],
		'water',
		'water'
	);
	assert.ok(seal);
	const nozzle = compileSeal(seal!);
	// Opposed lateral drives cancel; the clash converts to convergence C > 0.
	assert.ok(Math.hypot(nozzle.P.x, nozzle.P.y) < 1e-6, 'balanced P cancels');
	assert.ok(nozzle.C > 0.5, `clash converts to convergence, C=${nozzle.C}`);
	assert.ok(nozzle.manifests);

	// The field above the seal center flows out of the paper (world +y).
	const out = v3();
	sampleVelocity(nozzle, v3(0, 0.5, 0), out);
	assert.ok(out.y > 0.3, `vertical jet, u_y=${out.y}`);
	assert.ok(Math.abs(out.x) < 0.1 && Math.abs(out.z) < 0.1, 'no lateral drift');
});

test('one longer column tilts the jet where the long sign points (canon Sign_Length_Demo)', () => {
	// The long sign sits at ring angle 180 (west) pointing inward = east.
	const seal = buildSimSeal(
		[
			sign('column', 0),
			sign('column', 90),
			sign('column', 180, { sizeNorm: 0.55 }),
			sign('column', 270)
		],
		'water',
		'water'
	);
	const nozzle = compileSeal(seal!);
	// Net drive points east (+x): along the LONG sign's own pointing direction,
	// not toward its side of the ring — the corrected reading of the demo.
	assert.ok(nozzle.P.x > 0.05, `jet leans along the long sign's direction, P.x=${nozzle.P.x}`);
});

test('pull-only seals manifest nothing (GROUND_TRUTH §7 ruling)', () => {
	const seal = buildSimSeal(
		[sign('pull', 0), sign('pull', 90), sign('pull', 180), sign('pull', 270)],
		'wind',
		'wind-directs-air'
	);
	const nozzle = compileSeal(seal!);
	assert.equal(nozzle.manifests, false);
	assert.ok(nozzle.pull, 'pull bundle compiled');
	assert.ok(nozzle.pull!.C > 0, 'inward pulls sink');
	// Own-magic field is silent: the ambient population is the whole spell.
	const out = v3();
	sampleVelocity(nozzle, v3(0, 0.5, 0), out);
	assert.ok(Math.hypot(out.x, out.y, out.z) < 1e-6, 'no own-magic velocity');
});

test('scalar-only signs produce no seal, keeping the legacy effect path', () => {
	assert.equal(buildSimSeal([sign('crush', 0)], 'fire', 'fire'), null);
	assert.equal(buildSimSeal([], 'fire', 'fire'), null);
});

test('crystal sigil selects the crystal element variant', () => {
	const seal = buildSimSeal([sign('column', 0)], 'earth', 'crystal');
	assert.equal(seal?.element, 'crystal');
});

test('signature changes when a sign moves or grows', () => {
	const a = buildSimSeal([sign('column', 0)], 'fire', 'fire');
	const b = buildSimSeal([sign('column', 45)], 'fire', 'fire');
	const c = buildSimSeal([sign('column', 0, { sizeNorm: 0.6 })], 'fire', 'fire');
	assert.notEqual(simSealSignature(a), simSealSignature(b));
	assert.notEqual(simSealSignature(a), simSealSignature(c));
	assert.equal(simSealSignature(null), 'none');
});

test('tangential pull pinwheel twists the ambient medium (§7 helical inflow)', () => {
	// Three pulls, 120° apart, each pointing along +t̂ (counter-clockwise) with
	// a slight inward tilt: circulation plus a small sink — the vortex seal.
	const signs: SimSeal['signs'] = [0, 120, 240].map((deg) => {
		const a = (deg * Math.PI) / 180;
		const rhat = { x: Math.cos(a), y: Math.sin(a) };
		const that = { x: -rhat.y, y: rhat.x };
		const tilt = 0.45; // inward fraction
		const d = Math.hypot(that.x - tilt * rhat.x, that.y - tilt * rhat.y);
		return {
			kind: 'pull' as const,
			pos: { x: 0.8 * rhat.x, y: 0.8 * rhat.y },
			dir: { x: (that.x - tilt * rhat.x) / d, y: (that.y - tilt * rhat.y) / d },
			len: 1.2
		};
	});
	const nozzle = compileSeal({ element: 'fire', signs });
	assert.ok(nozzle.pull, 'pull bundle compiled');
	assert.ok(nozzle.pull!.gamma > 0.5, `arrows turning ccw twist, Γ_p=${nozzle.pull!.gamma}`);
	assert.ok(nozzle.pull!.C > 0.1, `inward tilt sinks, C_p=${nozzle.pull!.C}`);
	// At a rim point the ambient flow is dominantly tangential (ccw), with an
	// inward component: matter spirals toward the seal instead of beelining.
	const out = v3();
	sampleAmbientVelocity(nozzle, v3(0.8, 0.2, 0), out);
	const tangential = out.z; // t̂ at +x is +z in world (ccw seen from above... sign checked below)
	const inward = -out.x;
	assert.ok(Math.abs(tangential) > 0.2, `swirl moves the medium, u_t=${tangential}`);
	assert.ok(inward > 0.05, `medium spirals inward, u_in=${inward}`);
});

test('tangential pinwheel raises a tornado cell, not a flat stir (§7 twist vortex)', () => {
	// Three pure-tangential pulls: Γ_p ≈ 2.9, no sink — the tornado seal.
	const signs: SimSeal['signs'] = [0, 120, 240].map((deg) => {
		const a = (deg * Math.PI) / 180;
		const rhat = { x: Math.cos(a), y: Math.sin(a) };
		return {
			kind: 'pull' as const,
			pos: { x: 0.8 * rhat.x, y: 0.8 * rhat.y },
			dir: { x: -rhat.y, y: rhat.x },
			len: 1.2
		};
	});
	const nozzle = compileSeal({ element: 'water', signs });
	assert.ok(Math.abs(nozzle.pull!.C) < 0.1, 'pure tangential: no sink');
	const out = v3();

	// funnel wall at mid height: strong spin AND a rising updraft
	sampleAmbientVelocity(nozzle, v3(0.28, 1.3, 0), out);
	assert.ok(out.y > 0.3, `wall updraft lifts, u_y=${out.y}`);
	assert.ok(Math.abs(out.z) > 0.3, `wall keeps spinning, u_t=${out.z}`);

	// floor outside the core: boundary-layer inflow spirals matter in
	sampleAmbientVelocity(nozzle, v3(0.7, 0.05, 0), out);
	assert.ok(-out.x > 0.3, `floor feeds the foot, u_in=${-out.x}`);

	// above the crown: the cell closes — matter spills out and down
	sampleAmbientVelocity(nozzle, v3(0.46, 2.75, 0), out);
	assert.ok(out.x > 0.1, `crown sheds outward, u_out=${out.x}`);
	assert.ok(out.y < -0.1, `spill turns down, u_y=${out.y}`);
});

test('tangential columns manifest an own-magic vortex (§13 pinwheel)', () => {
	const signs: SimSeal['signs'] = [0, 120, 240].map((deg) => {
		const a = (deg * Math.PI) / 180;
		const rhat = { x: Math.cos(a), y: Math.sin(a) };
		return {
			kind: 'column' as const,
			pos: { x: 0.8 * rhat.x, y: 0.8 * rhat.y },
			dir: { x: -rhat.y, y: rhat.x },
			len: 1.2
		};
	});
	const nozzle = compileSeal({ element: 'fire', signs });
	assert.ok(nozzle.manifests, 'columns manifest');
	assert.ok(nozzle.gamma > 1, `tangential columns circulate, Γ=${nozzle.gamma}`);
	const out = v3();
	sampleVelocity(nozzle, v3(0.28, 1.3, 0), out);
	assert.ok(out.y > 0.3, `own swirl climbs, u_y=${out.y}`);
	assert.ok(Math.abs(out.z) > 0.3, `own swirl spins, u_t=${out.z}`);
});

test('region chevrons become gates, not momentum', () => {
	const seal: SimSeal | null = buildSimSeal(
		[sign('column', 90), sign('column', 270), sign('directed', 0), sign('directed', 180)],
		'water',
		'water'
	);
	const nozzle = compileSeal(seal!);
	assert.ok(nozzle.gates.length >= 1, 'chevrons compile into gate units');
	// Regions contribute zero flux: S comes from the two columns only.
	const columnsOnly = compileSeal(
		buildSimSeal([sign('column', 90), sign('column', 270)], 'water', 'water')!
	);
	assert.ok(Math.abs(nozzle.S - columnsOnly.S) < 1e-9);
});
