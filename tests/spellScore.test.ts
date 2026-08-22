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
import { LAB_PRESETS, presetById } from '../src/lib/ui/spellEffectLabPresets.js';
import { signedAngleDifferenceDeg, vectorFromAngleDeg } from '../src/lib/utils/geometry.js';
import type { CurveId, SealReading, SignReading, SpellPlan, SpellScore } from '../src/lib/types.js';

const SIGIL = 'water';
const SOURCE = { signature: 'test-spell', duration: 4 };

function scoreFor(presetId: string, sigil = SIGIL): SpellScore {
	return compileScore(resolvePlan(readPresetSeal(presetById(presetId).signs, sigil)), SOURCE);
}

function everyScore(sigil = SIGIL): SpellScore[] {
	return LAB_PRESETS.map((preset) =>
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

/** A levitation sign. Facing inward its clash closes a grip; tangential it does not. */
function levitation(atDeg: number, facingDeg = (atDeg + 180) % 360): SignReading {
	return { ...column(atDeg, facingDeg), id: 'levitation', manifestation: 'levitation' };
}

function reading(signs: SignReading[]): SealReading {
	return { signs, sigil: SIGIL, element: 'water', quality: 1, symmetry: null, notes: [] };
}

/**
 * Four columns each pointing a quarter turn off their own arm: `P = 0, C = 0,
 * Gamma = S`, which `docs/ground-truth.md` section 4 calls a vortex. No lab
 * preset draws it, so R-05's circulation is pinned on a reading built here.
 */
function pinwheelPlan(sense: 1 | -1 = 1): SpellPlan {
	const signs = [0, 90, 180, 270].map((atDeg) => column(atDeg, (atDeg + 360 + 90 * sense) % 360));
	const plan = resolvePlan(reading(signs));
	assert.ok(Math.abs(plan.circulation) > 1, 'fixture stopped circulating');
	return plan;
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
		}
	}
});

test('R-01: the charge beat belongs to the ambient medium, and to nothing else', () => {
	// The charge is content, not dead time: the medium draws inward while the
	// portal tilts. It is the one exception to the silence, and the exception is
	// exactly one kind wide.
	for (const score of everyScore()) {
		for (const track of scoreTracks(score)) {
			const atCharge = evaluateEnvelope(track.emission, score.beats, score.beats.charge.startMs);
			if (track.kind === 'shimmer') {
				assert.ok(atCharge > 0, 'the medium must seed itself during the charge');
			} else {
				assert.equal(atCharge, 0, `${track.id} manifests before the portal has tilted`);
			}
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

/** The two tracks R-10 makes ambient by law, whatever class the sigil belongs to. */
const AMBIENT_BY_LAW = new Set(['shimmer', 'intake']);

test('R-10: population follows the sigil class, never the sign family', () => {
	const ownSigils = ['fire', 'water', 'light', 'aeroform', 'crystal'];
	const ambientSigils = ['wind-directs-air', 'earth'];
	for (const sigil of ownSigils) {
		for (const score of everyScore(sigil)) {
			for (const track of scoreTracks(score)) {
				// The medium is never the spell's own, and section 7 exempts the spell's
				// own manifestation from the pull field outright, so an intake is
				// ambient even under a create-class sigil.
				const expected = AMBIENT_BY_LAW.has(track.kind) ? 'ambient' : 'own';
				assert.equal(track.population, expected, `${sigil}/${track.id} left its population`);
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

test('R-10: every score carries the ambient medium, so nothing has an empty world', () => {
	for (const score of [
		...everyScore(),
		inertQuadrupoleScore(),
		compileScore(inertPlan(), SOURCE)
	]) {
		const medium = scoreTracks(score).filter((track) => track.kind === 'shimmer');
		assert.equal(medium.length, 1, 'a score holds exactly one ambient medium');
		assert.equal(medium[0].population, 'ambient');
		assert.ok(medium[0].emission.gain > 0, 'the medium would seed nothing');
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
		['shimmer-ambient', 'burst', 'jet-default']
	);
});

test('R-13: every family that has a kernel gets its own primitive, not a stand-in', () => {
	// `vessel` is the one primitive still deferred, and no lab preset draws an orb,
	// so no preset may carry a routed-* note at all.
	for (const preset of LAB_PRESETS) {
		for (const note of scoreFor(preset.id).notes) {
			assert.ok(!note.startsWith('routed-'), `${preset.id} is still routing: ${note}`);
		}
	}
	const owners: Array<[presetId: string, trackId: string]> = [
		['levitation', 'hold-levitation'],
		['pull-inward', 'intake-pull'],
		['pull-vortex', 'intake-pull'],
		['pull-inverted', 'intake-pull']
	];
	for (const [presetId, trackId] of owners) {
		assert.ok(
			scoreTracks(scoreFor(presetId)).some((track) => track.id === trackId),
			`${presetId} has no ${trackId}`
		);
	}
});

test('R-10: the pull family acts on the ambient population under any sigil', () => {
	// Ground truth section 7 exempts the spell's own manifestation from the pull
	// field, or grasping wind would swallow its own burst.
	for (const sigil of ['fire', 'water', 'crystal', 'earth']) {
		const intake = scoreTracks(scoreFor('pull-inward', sigil)).find(
			(track) => track.kind === 'intake'
		);
		assert.ok(intake, `${sigil} lost its intake`);
		assert.equal(intake.population, 'ambient', `${sigil} pulled on its own manifestation`);
	}
});

test('R-05: circulation scores a vortex past a dead-band, and region ink never does', () => {
	const vortex = scoreTracks(compileScore(pinwheelPlan(), SOURCE)).find(
		(track) => track.kind === 'vortex'
	);
	assert.ok(vortex, 'a pinwheel of columns must score a vortex');
	assert.ok(vortex.params.spin > 0, 'positive Gamma turns counter-clockwise seen from +z');

	// The mirrored pinwheel turns the other way, and nothing else changes.
	const mirrored = scoreTracks(compileScore(pinwheelPlan(-1), SOURCE)).find(
		(track) => track.kind === 'vortex'
	);
	assert.ok(mirrored && mirrored.params.spin < 0, 'negative Gamma must turn clockwise');

	// `swirl-pushes` looks like a pinwheel and is not one: its ink is chevrons, so
	// R-09's valve owns it, and R-05's Gamma is a column-family aggregate that
	// stays at zero. The plan says so already, in `region-unruled`.
	const plan = resolvePlan(readPresetSeal(presetById('swirl-pushes').signs, SIGIL));
	assert.equal(plan.circulation, 0, 'chevrons started paying into the column aggregate');
	assert.ok(plan.notes.includes('region-unruled'));
	assert.ok(
		!scoreTracks(scoreFor('swirl-pushes')).some((track) => track.kind === 'vortex'),
		'a seal with no circulation scored a vortex'
	);

	// And the dead-band keeps a hand's incidental twist from authoring one.
	const dusty = { ...plan, circulation: 0.05 };
	assert.ok(
		!scoreTracks(compileScore(dusty, SOURCE)).some((track) => track.kind === 'vortex'),
		'drawing dust authored a vortex'
	);
});

test('[R-18] a declared coupling is soft, and says so', () => {
	// The plan names which primitives a hold captures. The score writes the holder
	// on them and tags the ranking: drive while driven, grip on coast.
	const plan = resolvePlan(reading([column(180, 0), levitation(0), levitation(180)]));
	assert.deepEqual(plan.couplings, [{ holder: 'hold', captures: ['burst', 'jet'] }]);

	const score = compileScore(plan, SOURCE);
	const holder = scoreTracks(score).find((track) => track.kind === 'hold');
	assert.ok(holder, 'the fixture must close a grip');
	assert.ok(score.notes.includes('coupling-soft'), 'the ranking is named, not silent');
	for (const track of scoreTracks(score)) {
		const captured = track.kind === 'burst' || track.kind === 'jet';
		assert.equal(track.capturedBy, captured ? holder.id : undefined, `${track.id} bound wrongly`);
	}
});

test('[R-18] a grip catches the burst even when the seal spends no column ink', () => {
	// Section 6's skirt: a hold that declares no coupling lets the burst escape it
	// near the plane. R-11 strikes unconditionally, so the burst is always there
	// to be caught, whatever the column budget is.
	const plan = resolvePlan(readPresetSeal(presetById('levitation').signs, SIGIL));
	assert.equal(plan.budget, 0, 'levitation ink pays into the hold budget only (R-13)');
	assert.deepEqual(plan.couplings, [{ holder: 'hold', captures: ['burst'] }]);

	const burst = scoreTracks(scoreFor('levitation')).find((track) => track.kind === 'burst');
	assert.ok(burst?.capturedBy, 'the burst escaped the grip');
});

test('[R-20] a hold fills to a capacity set by its grip, and a rotor has none', () => {
	const held = scoreTracks(scoreFor('levitation')).find((track) => track.kind === 'hold');
	assert.ok(held, 'the levitation preset must score a hold');
	assert.ok(held.params.capacity > 0, 'a gripping hold owes section 6 a W_max');

	// W_max is linear in the grip, so half the clash holds half the mass.
	const weaker = scoreTracks(scoreFor('column-levitation')).find((track) => track.kind === 'hold');
	assert.ok(weaker);
	assert.ok(
		weaker.params.capacity < held.params.capacity,
		'capacity must follow the grip, not the cast length'
	);

	// R-16's rotor grips nothing, so it never fills and its valve never closes.
	const rotor = resolvePlan(
		reading([0, 90, 180, 270].map((atDeg) => levitation(atDeg, (atDeg + 90) % 360)))
	);
	const spun = scoreTracks(compileScore(rotor, SOURCE)).find((track) => track.kind === 'hold');
	assert.ok(spun, 'R-16: a pinwheel scores a hold');
	assert.equal(spun.params.capacity, 0);
	assert.ok(spun.emission.gain > 0, 'and it still feeds, or the rotor has nothing to spin');
});

test('[R-16] a levitation rotor scores a spinning hold, not a vortex', () => {
	const plan = resolvePlan(
		reading([0, 90, 180, 270].map((atDeg) => levitation(atDeg, (atDeg + 90) % 360)))
	);
	assert.ok(plan.hold);
	const tracks = scoreTracks(compileScore(plan, SOURCE));
	const hold = tracks.find((track) => track.kind === 'hold');
	assert.ok(hold, 'section 6 predicts a rotor and R-16 rules one');
	assert.notEqual(hold.params.spin, 0, 'the whole point of a rotor is its spin');
	// R-13 survives: circulation stays the column engine's verb, so levitation
	// never smuggles itself in as a vortex.
	assert.equal(plan.circulation, 0);
	assert.ok(!tracks.some((track) => track.kind === 'vortex'));
});

test('[R-15] cancelled ink strikes exactly as quietly as an unmarked ring', () => {
	const cancelled = resolvePlan(
		reading([column(0, 180), column(180, 0), column(90, 90), column(270, 270)])
	);
	assert.ok(cancelled.notes.includes('inert-quadrupole'));
	assert.ok(cancelled.budget > 0, 'the ink is spent, not refunded');

	const burstOf = (plan: SpellPlan) =>
		scoreTracks(compileScore(plan, SOURCE)).find((track) => track.kind === 'burst');
	const spent = burstOf(cancelled);
	const blank = burstOf(inertPlan());
	assert.ok(spent && blank);
	// R-15: cancelled flux buys no impulse, so the ring is the bare shockwave.
	assert.deepEqual(spent.params, blank.params);
	assert.equal(spent.emission.gain, blank.emission.gain);
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test('identical inputs mean an identical score, and identical signature means identical cast', () => {
	const plan = resolvePlan(readPresetSeal(presetById('column-balanced').signs, SIGIL));
	assert.deepStrictEqual(compileScore(plan, SOURCE), compileScore(plan, SOURCE));

	const seeds = new Set(everyScore().map((score) => score.seed));
	assert.equal(seeds.size, 1, 'the seed follows the spell signature, not the plan');

	// Every preset that manifests something owes a distinct timeline. The ones
	// that manifest nothing deliberately share one: R-11 makes "nothing" a look,
	// and R-15 rules that cancelled ink buys no impulse, so a cancelled
	// quadrupole, an inverted levitation ring and an unruled chevron arrangement
	// all resolve to the same bare shockwave. They still cast differently,
	// because the seed follows the spell signature and not the score.
	const [manifesting, blank] = [false, true].map((nothing) =>
		everyScore().filter((score) => score.notes.includes('manifests-nothing') === nothing)
	);
	assert.equal(
		new Set(manifesting.map((score) => score.signature)).size,
		manifesting.length,
		'two presets that manifest something share a cast'
	);
	assert.ok(blank.length > 1, 'the manifests-nothing family must have members to collapse');
	assert.equal(
		new Set(blank.map((score) => score.signature)).size < blank.length,
		true,
		'R-15: seals that manifest nothing must be indistinguishable, not merely similar'
	);

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
