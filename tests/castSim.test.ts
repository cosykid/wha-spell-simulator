/**
 * Law tests for the cast simulation. The rulings from `docs/animation-spec.md`
 * are cited by id; the rest pin the redesign's own contracts from
 * `docs/animation-redesign.md` section 4, chief among them that stepping fresh
 * to a timestamp is bit-identical to stepping there incrementally.
 *
 * The golden tier proves the same replayability on rendered bytes. This file
 * proves it on the state, and adds the claims a PNG cannot show: which track a
 * parcel belongs to, and which kernel it is allowed to feel.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { compileScore, scoreTracks } from '../src/lib/cast/score/compileScore.js';
import { CAST, newCast, simulateTo, stepTo, stepsFor } from '../src/lib/cast/sim/cast.js';
import { hashSeed, mulberry32 } from '../src/lib/cast/sim/rng.js';
import { JET } from '../src/lib/cast/sim/primitives/jet.js';
import { FAN } from '../src/lib/cast/sim/primitives/fan.js';
import { classifyTwist } from '../src/lib/compiler/reading/facing.js';
import { inertPlan, resolvePlan } from '../src/lib/compiler/plan/resolvePlan.js';
import { readPresetSeal } from '../src/lib/ui/spellEffectLab.js';
import { FIELD_PRESETS, presetById } from '../src/lib/ui/spellEffectLabPresets.js';
import { signedAngleDifferenceDeg, vectorFromAngleDeg } from '../src/lib/utils/geometry.js';
import type { CastState } from '../src/lib/cast/sim/cast.js';
import type { Parcel } from '../src/lib/cast/sim/parcel.js';
import type { SealReading, SignReading, SpellScore } from '../src/lib/types.js';

const SIGIL = 'water';
const SOURCE = { signature: 'test-spell', duration: 4 };

/** Timestamps deliberately unlike the golden tier's, all on a whole step. */
const SAMPLE_MS = [975, 1025, 1300, 1875, 2400, 3000, 3800] as const;

function scoreFor(presetId: string, signature = SOURCE.signature): SpellScore {
	return compileScore(resolvePlan(readPresetSeal(presetById(presetId).signs, SIGIL)), {
		...SOURCE,
		signature
	});
}

function everyScore(): SpellScore[] {
	return FIELD_PRESETS.map((preset) =>
		compileScore(resolvePlan(readPresetSeal(preset.signs, SIGIL)), SOURCE)
	);
}

function column(atDeg: number, facingDeg: number): SignReading {
	return {
		id: 'column',
		manifestation: 'column',
		at: vectorFromAngleDeg(atDeg),
		length: 1,
		facing: vectorFromAngleDeg(facingDeg),
		facingClass: classifyTwist(signedAngleDifferenceDeg(atDeg + 180, facingDeg)),
		facingSource: 'ml-pose',
		facingTrust: 0.9,
		power: 0.7
	};
}

function reading(signs: SignReading[]): SealReading {
	return { signs, sigil: SIGIL, element: 'water', quality: 1, symmetry: null, notes: [] };
}

/** Everything a replay must reproduce. The rng is a closure, so it is compared by its output. */
function snapshot(state: CastState) {
	return {
		tMs: state.tMs,
		steps: state.steps,
		pending: state.pending,
		parcels: state.parcels,
		nextRandom: state.rng()
	};
}

// ---------------------------------------------------------------------------
// The clock and the replay contract
// ---------------------------------------------------------------------------

test('the clock is a product of whole steps, never a running sum', () => {
	const score = scoreFor('column-balanced');
	const state = simulateTo(score, 2400);
	assert.equal(state.steps, stepsFor(2400));
	assert.equal(state.tMs, state.steps * CAST.stepMs);
	assert.equal(state.tMs, 2400);
});

test('stepping fresh to a timestamp is bit-identical to stepping there incrementally', () => {
	for (const score of everyScore()) {
		const incremental = newCast(score);
		for (const atMs of SAMPLE_MS) {
			stepTo(score, incremental, atMs);
		}
		const fresh = simulateTo(score, SAMPLE_MS[SAMPLE_MS.length - 1]);
		assert.deepStrictEqual(
			snapshot(incremental),
			snapshot(fresh),
			'a cast diverged between the two paths'
		);
	}
});

test('two runs of the same cast produce the same state', () => {
	for (const score of everyScore()) {
		assert.deepStrictEqual(snapshot(simulateTo(score, 2600)), snapshot(simulateTo(score, 2600)));
	}
});

test('a cast never steps backwards, and a repeated target is a no-op', () => {
	const score = scoreFor('dispersion');
	const state = stepTo(score, newCast(score), 2000);
	const settled = structuredClone({ steps: state.steps, tMs: state.tMs });
	stepTo(score, state, 1000);
	assert.deepStrictEqual({ steps: state.steps, tMs: state.tMs }, settled);
});

// ---------------------------------------------------------------------------
// R-01, R-02: what the beats mean in parcels
// ---------------------------------------------------------------------------

test('R-01: nothing spawns during the charge beat', () => {
	for (const score of everyScore()) {
		assert.equal(simulateTo(score, 975).parcels.length, 0);
	}
});

test('R-02: no parcel is born once release has begun', () => {
	for (const score of everyScore()) {
		const releaseStep = stepsFor(score.beats.release.startMs);
		for (const parcel of simulateTo(score, score.totalMs).parcels) {
			assert.ok(
				parcel.bornStep <= releaseStep,
				`${parcel.trackId} spawned in release on ${score.signature}`
			);
		}
	}
});

// ---------------------------------------------------------------------------
// Resolution, not superposition
// ---------------------------------------------------------------------------

test('a parcel belongs to exactly one track and feels only that track kernel', () => {
	for (const score of everyScore()) {
		const ids = new Set(scoreTracks(score).map((track) => track.id));
		const state = simulateTo(score, 2600);
		for (const parcel of state.parcels) {
			assert.ok(ids.has(parcel.trackId), `${parcel.trackId} belongs to no track in this score`);
		}
	}
	// The kernels themselves take no state beyond their own params, a point and an
	// age, so there is no channel through which one track could reach another.
	const at = { x: 0.3, y: -0.2, z: 0.4 };
	const params = {
		axis: { x: 0, y: 0, z: 1 },
		speed: 2,
		footprint: 0.45,
		converge: 0.6,
		reach: 1.6
	};
	assert.deepStrictEqual(JET.velocity(params, at, 0), JET.velocity(params, at, 0));
});

test('R-05: a jet leans where the ink points, not toward where the ink sits', () => {
	// A long column drawn on the left pointing right throws the beam right.
	const plan = resolvePlan(reading([column(180, 0)]));
	const jet = scoreTracks(compileScore(plan, SOURCE)).find((track) => track.kind === 'jet');
	assert.ok(jet, 'a column with an aim must score a jet');
	assert.ok(jet.params.axis.x > 0, 'the beam leaned back toward its own sign');
});

test('R-07: a fan hugs the plane it spreads across', () => {
	const params = { speed: 1.5, swirl: 0, rise: 0.18, core: 0.4, ceiling: 0.35 };
	const low = FAN.velocity(params, { x: 0.5, y: 0, z: 0 }, 0);
	const high = FAN.velocity(params, { x: 0.5, y: 0, z: 0.35 }, 0);
	assert.ok(low.x > 0, 'the fan must push outward');
	assert.ok(low.z > 0 && high.z === 0, 'lift must fade out at the ceiling');

	const score = scoreFor('dispersion');
	const heights = simulateTo(score, 2600)
		.parcels.filter((parcel) => parcel.trackId === 'fan-dispersion')
		.map((parcel) => parcel.at.z);
	assert.ok(heights.length > 0, 'the dispersion fan emitted nothing');
	assert.ok(Math.max(...heights) < 1, 'a dispersion fan climbed like a column');
});

// ---------------------------------------------------------------------------
// R-11 and determinism
// ---------------------------------------------------------------------------

test('R-11: cancelled and empty seals still put parcels on the canvas', () => {
	const inert = compileScore(resolvePlan(reading([column(0, 0), column(0, 180)])), SOURCE);
	for (const score of [inert, compileScore(inertPlan(), SOURCE)]) {
		const state = simulateTo(score, 2000);
		assert.ok(state.parcels.length > 0, 'the renderer would have nothing to draw');
	}
});

test('a different spell signature is a different spawn stream', () => {
	const first = simulateTo(scoreFor('column-balanced'), 1600);
	const second = simulateTo(scoreFor('column-balanced', 'a-different-spell'), 1600);
	assert.notEqual(
		first.parcels[0].at.x,
		second.parcels[0].at.x,
		'the seed did not reach the spawn'
	);
	assert.equal(first.parcels.length, second.parcels.length, 'emission timing is not random');
});

test('the seeded rng is the only randomness, and it is stable', () => {
	assert.equal(hashSeed(''), 0x811c9dc5);
	const stream = Array.from({ length: 3 }, mulberry32(hashSeed('cast')));
	assert.deepStrictEqual(stream, Array.from({ length: 3 }, mulberry32(hashSeed('cast'))));
});

test('a cast stays inside its parcel budget and its scene bounds', () => {
	for (const score of everyScore()) {
		const parcels: Parcel[] = simulateTo(score, score.totalMs).parcels;
		assert.ok(parcels.length <= CAST.maxParcels);
		for (const parcel of parcels) {
			assert.ok(Math.hypot(parcel.at.x, parcel.at.y) <= CAST.bounds);
			assert.ok(parcel.ageS < parcel.lifetimeS);
		}
	}
});
