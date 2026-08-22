/**
 * Law tests for the Score layer. Every test cites the ruling it pins, by id,
 * from `docs/animation-spec.md`. The Score is where "timing must be authored"
 * became structural, so these tests are mostly about time: what may stretch,
 * what may not, and what a track is allowed to still be doing when the spell
 * starts letting go.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
	beatAtOrBefore,
	BEAT_MS,
	BEAT_ORDER,
	bodyMsFor,
	buildBeats,
	FIXED_MS,
	totalMsFor
} from '../src/lib/cast/score/beats.js';
import { CURVES, curveAt, evaluateEnvelope } from '../src/lib/cast/score/envelopes.js';
import { compileScore, scoreTracks } from '../src/lib/cast/score/compileScore.js';
import { classifyTwist } from '../src/lib/compiler/reading/facing.js';
import { inertPlan, resolvePlan } from '../src/lib/compiler/plan/resolvePlan.js';
import { PORTAL } from '../src/lib/portal/portal.js';
import { readPresetSeal } from '../src/lib/ui/spellEffectLab.js';
import { FIELD_PRESETS, presetById } from '../src/lib/ui/spellEffectLabPresets.js';
import { signedAngleDifferenceDeg, vectorFromAngleDeg } from '../src/lib/utils/geometry.js';
import type { CurveId, SealReading, SignReading, SpellScore } from '../src/lib/types.js';

const SIGIL = 'water';
const SOURCE = { signature: 'test-spell', duration: 4 };

function scoreFor(presetId: string, sigil = SIGIL): SpellScore {
	return compileScore(resolvePlan(readPresetSeal(presetById(presetId).signs, sigil)), SOURCE);
}

function everyScore(sigil = SIGIL): SpellScore[] {
	return FIELD_PRESETS.map((preset) =>
		compileScore(resolvePlan(readPresetSeal(preset.signs, sigil)), SOURCE)
	);
}

/** A gated column sign, built the way `readSeal` builds one. */
function column(atDeg: number, facingDeg: number): SignReading {
	const at = vectorFromAngleDeg(atDeg);
	return {
		id: 'column',
		manifestation: 'column',
		at,
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

/**
 * Open canon question 2: ink whose moments cancel. Two columns in one place
 * facing opposite ways pay a budget and aim at nothing. No lab preset draws it,
 * so R-11's promise is pinned on a reading built here.
 */
function inertQuadrupoleScore(): SpellScore {
	const plan = resolvePlan(reading([column(0, 0), column(0, 180)]));
	assert.ok(plan.notes.includes('inert-quadrupole'), 'fixture stopped being inert');
	return compileScore(plan, SOURCE);
}

// ---------------------------------------------------------------------------
// R-01, R-02: the beat clock
// ---------------------------------------------------------------------------

test('R-01: the charge beat is the portal tilt, stated once', () => {
	assert.equal(BEAT_MS.charge, PORTAL.tiltMs);
	assert.equal(buildBeats(4000).charge.endMs, PORTAL.tiltMs);
});

test('R-01: totalMs and bodyMs clamp to the ruled ranges', () => {
	assert.equal(totalMsFor(1), 3080);
	assert.equal(totalMsFor(20), 8480);
	assert.equal(totalMsFor(5.5), 5500);
	assert.equal(bodyMsFor(3080), 600);
	assert.equal(bodyMsFor(8480), 6000);
	assert.equal(FIXED_MS, 2480);
});

test('R-02: only body stretches, and the beats always fill the cast exactly', () => {
	const short = buildBeats(totalMsFor(3.08));
	const long = buildBeats(totalMsFor(8.48));
	for (const beat of BEAT_ORDER) {
		const shortMs = short[beat].endMs - short[beat].startMs;
		const longMs = long[beat].endMs - long[beat].startMs;
		if (beat === 'body') {
			assert.ok(longMs > shortMs, 'the body beat must stretch');
		} else {
			assert.equal(longMs, shortMs, `${beat} stretched, which reads as slow motion`);
		}
	}
	for (const totalMs of [3080, 4000, 5500, 8480]) {
		const beats = buildBeats(totalMs);
		assert.equal(beats.afterglow.endMs, totalMs);
		assert.equal(beats.charge.startMs, 0);
		for (let i = 1; i < BEAT_ORDER.length; i += 1) {
			assert.equal(beats[BEAT_ORDER[i]].startMs, beats[BEAT_ORDER[i - 1]].endMs);
		}
	}
});

test('R-02: no track is still emitting when release begins', () => {
	// The structural form of "nothing may still be charging when release begins":
	// an emission envelope may not name a beat past `body`.
	for (const score of everyScore()) {
		for (const track of scoreTracks(score)) {
			assert.ok(
				beatAtOrBefore(track.emission.to, 'body'),
				`${track.id} emits into ${track.emission.to}`
			);
			assert.equal(
				evaluateEnvelope(track.emission, score.beats, score.beats.release.startMs),
				0,
				`${track.id} emits at the top of release`
			);
			assert.equal(
				evaluateEnvelope(track.emission, score.beats, score.beats.charge.startMs),
				0,
				`${track.id} emits before the portal has tilted`
			);
		}
	}
});

// ---------------------------------------------------------------------------
// The curve vocabulary
// ---------------------------------------------------------------------------

test('every curve is bounded by 0 and 1 over its whole window', () => {
	for (const [id, curve] of Object.entries(CURVES)) {
		for (let step = 0; step <= 20; step += 1) {
			const value = curve(step / 20);
			assert.ok(value >= 0 && value <= 1 + 1e-12, `${id} left 0..1 at u=${step / 20}`);
		}
	}
});

test('the six curves have the boundary values their names promise', () => {
	const boundaries: Record<CurveId, [start: number, end: number]> = {
		attack: [0, 1],
		hold: [1, 1],
		decay: [1, 0],
		pulse: [0, 0],
		leak: [1, 0],
		swell: [0, 1]
	};
	// A hair of tolerance: `pulse` is a sine, and sin(pi) is not literally zero.
	const closeTo = (value: number, expected: number) => Math.abs(value - expected) < 1e-12;
	for (const [id, [start, end]] of Object.entries(boundaries) as [CurveId, [number, number]][]) {
		assert.ok(closeTo(curveAt(id, 0), start), `${id} starts at ${curveAt(id, 0)}, not ${start}`);
		assert.ok(closeTo(curveAt(id, 1), end), `${id} ends at ${curveAt(id, 1)}, not ${end}`);
	}
	assert.ok(closeTo(curveAt('pulse', 0.5), 1));
	// The two pairs that differ only in how fast they get there.
	assert.ok(curveAt('leak', 0.5) > curveAt('decay', 0.5), 'leak must outlast decay');
	assert.ok(curveAt('swell', 0.5) < curveAt('attack', 0.5), 'swell must arrive after attack');
});

test('an envelope is silent outside its own window', () => {
	const beats = buildBeats(4000);
	const envelope = { from: 'strike', to: 'body', curve: 'hold', gain: 7 } as const;
	assert.equal(evaluateEnvelope(envelope, beats, beats.charge.endMs - 1), 0);
	assert.equal(evaluateEnvelope(envelope, beats, beats.strike.startMs), 7);
	assert.equal(evaluateEnvelope(envelope, beats, beats.body.endMs), 0);
});

// ---------------------------------------------------------------------------
// R-08, R-10, R-11: what a track means
// ---------------------------------------------------------------------------

test('R-08: dispersion is a timing distinction, not a spatial one', () => {
	const fan = scoreTracks(scoreFor('dispersion')).find((track) => track.kind === 'fan');
	const jet = scoreTracks(scoreFor('column-balanced')).find((track) => track.kind === 'jet');
	assert.ok(fan && jet, 'the two presets must resolve to a fan and a jet');
	assert.equal(fan.id, 'fan-dispersion');
	assert.equal(fan.drive.curve, 'leak');
	// Lower gain, longer body: both halves of the ruling, in the two envelopes.
	assert.ok(fan.drive.gain < jet.drive.gain, 'the leak must be quieter than the column');
	assert.ok(fan.emission.gain < jet.emission.gain, 'the leak must emit less than the column');
	assert.ok(
		beatAtOrBefore(jet.drive.to, fan.drive.to) && jet.drive.to !== fan.drive.to,
		'the leak must still be driving after the column has stopped'
	);
	assert.ok(scoreFor('dispersion').notes.includes('dispersion-leak'));
});

test('R-10: population follows the sigil class, never the sign family', () => {
	const ownSigils = ['fire', 'water', 'light', 'aeroform', 'crystal'];
	const ambientSigils = ['wind-directs-air', 'earth'];
	for (const sigil of ownSigils) {
		for (const score of everyScore(sigil)) {
			for (const track of scoreTracks(score)) {
				assert.equal(track.population, 'own', `${sigil}/${track.id} left its own population`);
			}
		}
	}
	for (const sigil of ambientSigils) {
		for (const score of everyScore(sigil)) {
			for (const track of scoreTracks(score)) {
				assert.equal(track.population, 'ambient', `${sigil}/${track.id} is not ambient`);
			}
		}
	}
});

test('R-11: every plan compiles to at least one track, cancelled ink included', () => {
	for (const score of [
		...everyScore(),
		inertQuadrupoleScore(),
		compileScore(inertPlan(), SOURCE)
	]) {
		assert.ok(scoreTracks(score).length > 0, 'a score with no track is an empty canvas');
		assert.ok(
			scoreTracks(score).some((track) => track.kind === 'burst'),
			'every cast opens with a strike'
		);
		for (const track of scoreTracks(score)) {
			assert.ok(track.emission.gain > 0, `${track.id} would emit nothing`);
		}
	}
});

test('R-11: a seal that manifests nothing still gets a designed default', () => {
	const score = compileScore(inertPlan(), SOURCE);
	assert.ok(score.notes.includes('manifests-nothing'));
	assert.deepEqual(
		scoreTracks(score).map((track) => track.id),
		['burst', 'jet-default']
	);
});

test('a plan wanting an unbuilt primitive is routed and says so', () => {
	// Phase 4 owns hold, intake, vortex and vessel. Until then the nearest built
	// kind plays them, at a conservative gain, and the score names the swap.
	const routes: Array<[presetId: string, note: string, trackId: string]> = [
		['levitation', 'routed-hold', 'jet-hold'],
		['pull-inward', 'routed-intake', 'fan-intake'],
		['pull-vortex', 'routed-intake', 'fan-intake']
	];
	for (const [presetId, note, trackId] of routes) {
		const score = scoreFor(presetId);
		assert.ok(score.notes.includes(note as never), `${presetId} lost its ${note} note`);
		assert.ok(
			scoreTracks(score).some((track) => track.id === trackId),
			`${presetId} has no ${trackId}`
		);
	}
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test('identical inputs mean an identical score, and identical signature means identical cast', () => {
	const plan = resolvePlan(readPresetSeal(presetById('column-balanced').signs, SIGIL));
	assert.deepStrictEqual(compileScore(plan, SOURCE), compileScore(plan, SOURCE));

	const seeds = new Set(everyScore().map((score) => score.seed));
	assert.equal(seeds.size, 1, 'the seed follows the spell signature, not the plan');

	const signatures = everyScore().map((score) => score.signature);
	assert.equal(new Set(signatures).size, FIELD_PRESETS.length, 'two presets share a cast');

	// The seal's own reset key reaches the score through the seed, so a respelled
	// spell is a different cast even when its plan is identical.
	const other = compileScore(plan, { ...SOURCE, signature: 'other' });
	assert.notEqual(other.seed, compileScore(plan, SOURCE).seed);
	assert.notEqual(other.signature, compileScore(plan, SOURCE).signature);
});

test('R-12: a v1 score holds exactly one layer, and it carries the aperture', () => {
	for (const score of everyScore()) {
		assert.equal(score.layers.length, 1);
		assert.equal(score.layers[0].id, 'outer');
		assert.ok(score.layers[0].aperture.kind.length > 0);
	}
	assert.equal(scoreFor('region-ring').layers[0].aperture.kind, 'annulus');
});
