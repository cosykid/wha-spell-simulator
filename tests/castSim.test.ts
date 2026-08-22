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
import { HOLD } from '../src/lib/cast/sim/primitives/hold.js';
import { INTAKE } from '../src/lib/cast/sim/primitives/intake.js';
import { SHIMMER } from '../src/lib/cast/sim/primitives/shimmer.js';
import { VORTEX } from '../src/lib/cast/sim/primitives/vortex.js';
import { classifyTwist } from '../src/lib/compiler/reading/facing.js';
import { inertPlan, resolvePlan } from '../src/lib/compiler/plan/resolvePlan.js';
import { readPresetSeal } from '../src/lib/ui/spellEffectLab.js';
import { LAB_PRESETS, presetById } from '../src/lib/ui/spellEffectLabPresets.js';
import { signedAngleDifferenceDeg, vectorFromAngleDeg } from '../src/lib/utils/geometry.js';
import type { CastState } from '../src/lib/cast/sim/cast.js';
import type { Parcel } from '../src/lib/cast/sim/parcel.js';
import type { SealReading, SignReading, SpellScore, VortexParams } from '../src/lib/types.js';

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
	return LAB_PRESETS.map((preset) =>
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

test('R-01: only the ambient medium moves during the charge beat', () => {
	// R-01 gives the charge content, the medium drawing inward, and R-02 keeps
	// everything the seal manifests out of it. Both halves, in parcels.
	for (const score of everyScore()) {
		const kindOf = new Map(scoreTracks(score).map((track) => [track.id, track.kind]));
		const parcels = simulateTo(score, 975).parcels;
		assert.ok(parcels.length > 0, 'the charge beat is content, not an empty canvas');
		for (const parcel of parcels) {
			assert.equal(kindOf.get(parcel.trackId), 'shimmer', `${parcel.trackId} erupted early`);
		}
		const inward = parcels.filter((parcel) => {
			const arm = Math.hypot(parcel.at.x, parcel.at.y);
			return parcel.at.x * parcel.velocity.x + parcel.at.y * parcel.velocity.y < 0 && arm > 0;
		});
		assert.ok(inward.length > parcels.length / 2, 'the medium is not drawing inward');
	}
});

test('R-10: the medium is seeded, sparse and long-lived, whatever the seal does', () => {
	const shimmer = scoreTracks(scoreFor('column-balanced')).find(
		(track) => track.kind === 'shimmer'
	);
	const jet = scoreTracks(scoreFor('column-balanced')).find((track) => track.kind === 'jet');
	assert.ok(shimmer && jet, 'the preset must score both');
	assert.ok(shimmer.emission.gain < jet.emission.gain / 3, 'the medium is not thin');
	// A young ambient parcel draws in; a settled one has handed over to the curl.
	const params = shimmer.params;
	const at = { x: 0.8, y: 0, z: 0.3 };
	assert.ok(SHIMMER.velocity(params, at, 0).x < -0.1, 'a young ambient parcel must draw inward');
	assert.ok(
		Math.abs(SHIMMER.velocity(params, at, params.settleS * 2).x) < 0.1,
		'a settled ambient parcel must stop drawing inward'
	);
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
// The phase 4 kernels
// ---------------------------------------------------------------------------

/** The vortex a pinwheel of columns scores, for the kernel tests below. */
function pinwheelVortex(): VortexParams {
	const signs = [0, 90, 180, 270].map((atDeg) => column(atDeg, (atDeg + 90) % 360));
	const track = scoreTracks(compileScore(resolvePlan(reading(signs)), SOURCE)).find(
		(candidate) => candidate.kind === 'vortex'
	);
	assert.ok(track, 'a pinwheel of columns must score a vortex');
	return track.params;
}

test('R-05: the vortex is a Rankine cell, solid-body inside its core and 1/r outside', () => {
	const params = pinwheelVortex();
	const swirlAt = (radius: number) => -VORTEX.velocity(params, { x: radius, y: 0, z: 0.5 }, 0).y;
	// Inside the core the wall turns as one body, so the rate grows with radius.
	assert.ok(swirlAt(0.1) < swirlAt(0.2) && swirlAt(0.2) < swirlAt(0.3));
	// Outside it the tail falls away, which is what keeps a seal from stirring the room.
	assert.ok(swirlAt(0.8) > swirlAt(1.2) && swirlAt(1.2) > swirlAt(1.8));
	// Solid body means the ratio is the radius ratio, not a coincidence of scale.
	assert.ok(Math.abs(swirlAt(0.2) / swirlAt(0.1) - 2) < 1e-9);
});

test('R-05: the vortex eye is hollow and the updraft climbs the wall, not the axis', () => {
	const params = pinwheelVortex();
	// Inside the core the flow is thrown back out, so nothing fills the center.
	assert.ok(VORTEX.velocity(params, { x: 0.05, y: 0, z: 0.02 }, 0).x > 0.2);
	assert.ok(VORTEX.velocity(params, { x: 0.2, y: 0, z: 0.02 }, 0).x > 0);
	// The updraft is a sheath around that eye: faster on the wall than on the axis.
	const onAxis = VORTEX.velocity(params, { x: 0.02, y: 0, z: 0.4 }, 0).z;
	const onWall = VORTEX.velocity(params, { x: 0.4, y: 0, z: 0.4 }, 0).z;
	assert.ok(onWall > onAxis, 'the funnel wall must out-climb its own eye');
	// And the floor boundary layer feeds the foot from outside the band.
	assert.ok(VORTEX.velocity(params, { x: 1, y: 0, z: 0.01 }, 0).x < 0);
});

test('the salvaged spill rule: above the updraft the swirl fades and parcels spill out', () => {
	const params = pinwheelVortex();
	const above = (climb: number) =>
		VORTEX.velocity(params, { x: 0.4, y: 0, z: climb * params.height }, 0);
	const inside = above(0.5);
	const crown = above(1.15);
	assert.ok(Math.abs(crown.y) < Math.abs(inside.y), 'the swirl must fade past the crown');
	assert.ok(crown.x > inside.x, 'the crown must shed outward');
	assert.ok(crown.z < 0, 'and downward, which is what closes the cell');
});

test('R-13: a hold lifts to its ceiling and stops there', () => {
	const hold = scoreTracks(scoreFor('levitation')).find((track) => track.kind === 'hold');
	assert.ok(hold, 'the levitation preset must score a hold');
	const { at, radius, bobRate } = hold.params;
	const ceiling = at.z;
	// The hover ceiling curve: full lift on the paper, and none of it at the locus,
	// where all that is left is the bob.
	const bob = radius * bobRate;
	assert.ok(HOLD.velocity(hold.params, { x: 0, y: 0, z: 0 }, 0).z > bob);
	assert.ok(HOLD.velocity(hold.params, { x: 0, y: 0, z: ceiling }, 0).z <= bob + 1e-9);
	// The plan parks its locus in ink units; the score has to land it on the seal.
	assert.ok(ceiling > 0.3 && ceiling < 1.2, `the hover ceiling left the seal at ${ceiling}`);

	const heights = simulateTo(scoreFor('levitation'), 2600)
		.parcels.filter((parcel) => parcel.trackId === hold.id)
		.map((parcel) => parcel.at.z);
	assert.ok(heights.length > 0, 'the hold emitted nothing');
	assert.ok(Math.max(...heights) <= ceiling + radius + 1e-9, 'held magic climbed away');
});

test('open canon question 5: a hold captures what has arrived and lets a live column through', () => {
	const hold = scoreTracks(scoreFor('levitation')).find((track) => track.kind === 'hold');
	assert.ok(hold, 'the levitation preset must score a hold');
	const top = hold.params.at.z + hold.params.radius;
	const above = (speed: number): Parcel => ({
		trackId: 'jet-aim',
		population: 'own',
		look: 'body',
		at: { x: 0, y: 0, z: top + 0.5 },
		velocity: { x: 0, y: 0, z: speed },
		bornStep: 0,
		ageS: 0,
		lifetimeS: 2
	});
	const arrived = above(hold.params.captureSpeed / 2);
	HOLD.constrain!(hold.params, arrived);
	assert.ok(Math.abs(arrived.at.z - top) < 1e-9, 'a spent parcel must be caught at the ceiling');

	const driven = above(hold.params.captureSpeed * 4);
	HOLD.constrain!(hold.params, driven);
	assert.ok(driven.at.z > top, 'a live column was clipped mid-beam');
});

test('R-13: an intake draws the ambient medium in, and the same kernel pushes it out', () => {
	const inward = scoreTracks(scoreFor('pull-inward')).find((track) => track.kind === 'intake');
	const outward = scoreTracks(scoreFor('pull-inverted')).find((track) => track.kind === 'intake');
	assert.ok(inward && outward, 'both pull presets must score an intake');
	assert.equal(inward.population, 'ambient');
	const at = { x: 0.6, y: 0, z: 0 };
	assert.ok(INTAKE.velocity(inward.params, at, 0).x < 0, 'an inward pull must inhale');
	assert.ok(INTAKE.velocity(outward.params, at, 0).x > 0, 'an outward pull must push');
	// The finite core: the draw dies at the origin, so arriving matter pools.
	const near = Math.abs(INTAKE.velocity(inward.params, { x: 0.03, y: 0, z: 0 }, 0).x);
	assert.ok(
		near < Math.abs(INTAKE.velocity(inward.params, at, 0).x),
		'the center is a singularity'
	);
	// Only the twist lifts (the salvaged swirl lift): a straight pull stays flat.
	// A folded plan leaves rounding dust in a cancelled component, so the floor is
	// "nothing to speak of" rather than a literal zero.
	assert.ok(Math.abs(INTAKE.velocity(inward.params, at, 0).z) < 1e-9);
	const swirled = scoreTracks(scoreFor('pull-vortex')).find((track) => track.kind === 'intake');
	assert.ok(swirled && INTAKE.velocity(swirled.params, at, 0).z > 0, 'helical inflow must lift');
});

test('ground-truth 7: the twist holds an eye open, and a straight pull holds none', () => {
	const straight = scoreTracks(scoreFor('pull-inward')).find((track) => track.kind === 'intake');
	const swirled = scoreTracks(scoreFor('pull-vortex')).find((track) => track.kind === 'intake');
	assert.ok(straight && swirled, 'both pull presets must score an intake');
	assert.equal(straight.params.eye, 0, 'a straight pull pools; only the twist hollows');
	assert.ok(
		swirled.params.eye > 0,
		'canon calls the slanted case a vortex, and a vortex is hollow'
	);
	// Inside the eye the flow is thrown back out, the way `vortex.ts` sheathes its funnel.
	const inEye = { x: swirled.params.eye / 2, y: 0, z: 0 };
	assert.ok(INTAKE.velocity(swirled.params, inEye, 0).x > 0, 'the eye did not push back out');
	assert.ok(
		INTAKE.velocity(straight.params, inEye, 0).x < 0,
		'a straight pull must still inhale through the same point'
	);
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
