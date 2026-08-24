/**
 * The two directional cells: the jet that performs an aimed column (R-05) and
 * the fan that performs dispersion (R-07, R-08).
 *
 * What is pinned here is what a screenshot cannot catch: the charge is silent,
 * the five beats differ, a replay is exact, the drawn arrangement reaches the
 * flow shape — three columns feed three sites where one column feeds one — and a
 * declared coupling catches the column at the holder's shell (R-18).
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { BEAT_ORDER } from '../src/lib/cast/score/beats.js';
import { STAGE } from '../src/lib/cast/stage/frames.js';
import {
	castFor,
	disposeCast,
	performerOf,
	reportOf,
	reportsOf,
	scoreFor,
	steppedTo
} from './castHarness.js';
import type { HeadlessCast } from './castHarness.js';
import type { Beat, ScoreTrack, SpellScore, Track } from '../src/lib/types.js';

const SOURCE = { signature: 'test-directional', duration: 4 };

function score(presetId: string, sigil = 'fire'): SpellScore {
	return scoreFor(presetId, sigil, SOURCE);
}

/** The middle of each beat, on a whole step. */
function beatStops(built: SpellScore, beats: readonly Beat[]): number[] {
	return beats.map((beat) => {
		const window = built.beats[beat];
		return Math.round((window.startMs + window.endMs) / 2 / STAGE.stepMs) * STAGE.stepMs;
	});
}

function jetProbe(cast: HeadlessCast) {
	const report = reportOf(cast, 'jet');
	return {
		ink: Number(report.ink.toFixed(5)),
		standing: Number(report.detail.standing.toFixed(5)),
		girth: Number(report.detail.girth.toFixed(5)),
		tipZ: Number(report.tip.z.toFixed(5))
	};
}

function fanProbe(cast: HeadlessCast) {
	const report = reportOf(cast, 'fan');
	return {
		ink: Number(report.ink.toFixed(5)),
		outer: Number(report.detail.outer.toFixed(5)),
		lift: Number(report.detail.lift.toFixed(5)),
		stir: Number(report.detail.stir.toFixed(5))
	};
}

/** The flow shape a kind's cell wrote, which is its whole output to the pigment. */
function shapeOf(cast: HeadlessCast, kind: ScoreTrack['kind']) {
	const index = cast.performers.indexOf(performerOf(cast, kind));
	return cast.substrate.channels[index].shape;
}

test('R-01: neither directional cell manifests during the charge', () => {
	const beam = steppedTo(score('column-balanced'), [600]);
	assert.equal(reportOf(beam, 'jet').ink, 0);
	assert.equal(reportOf(beam, 'jet').detail.standing, 0);

	const fan = steppedTo(score('dispersion'), [600]);
	assert.equal(reportOf(fan, 'fan').ink, 0);
	assert.equal(reportOf(fan, 'fan').marks, 0);
});

test('the strike is an impulse: the mouth flares and the front rears', () => {
	const built = score('column-balanced');
	const [strike, body] = beatStops(built, ['strike', 'body']);
	assert.ok(jetProbe(steppedTo(built, [strike])).girth > jetProbe(steppedTo(built, [body])).girth);

	const spread = score('dispersion');
	const [fanStrike, fanBody] = beatStops(spread, ['strike', 'body']);
	const wave = fanProbe(steppedTo(spread, [fanStrike]));
	assert.ok(wave.lift > 0, 'the lip never left the paper');
	assert.ok(wave.lift > fanProbe(steppedTo(spread, [fanBody])).lift);
});

test('all five beats of a column and a sheet read differently', () => {
	const built = score('column-balanced');
	const stops = beatStops(built, BEAT_ORDER);
	const shafts = stops.map((_, index) => jetProbe(steppedTo(built, stops.slice(0, index + 1))));
	assert.equal(new Set(shafts.map((one) => JSON.stringify(one))).size, shafts.length);
	// The charge is absent, the release commits and stretches, the afterglow fades.
	assert.equal(shafts[0].ink, 0);
	assert.ok(shafts[3].standing > shafts[2].standing, 'the release does not commit');
	assert.ok(shafts[4].ink < shafts[2].ink, 'the afterglow does not fade');

	const spread = score('dispersion');
	const fanStops = beatStops(spread, BEAT_ORDER);
	const sheets = fanStops.map((_, index) =>
		fanProbe(steppedTo(spread, fanStops.slice(0, index + 1)))
	);
	assert.equal(new Set(sheets.map((one) => JSON.stringify(one))).size, sheets.length);
	for (let i = 2; i < sheets.length; i += 1) {
		assert.ok(sheets[i].outer >= sheets[i - 1].outer, 'the front drew back');
	}
});

test('stepping fresh to a timestamp matches stepping there incrementally', () => {
	for (const presetId of ['column-balanced', 'dispersion']) {
		const built = score(presetId);
		const fresh = steppedTo(built, [2600]);
		const walked = steppedTo(built, [400, 1100, 1600, 2200, 2600]);
		assert.deepEqual(reportsOf(fresh), reportsOf(walked), presetId);
	}
});

test('the same score builds the same forms twice', () => {
	const built = score('column-balanced');
	assert.deepEqual(reportsOf(steppedTo(built, [1600])), reportsOf(steppedTo(built, [1600])));
});

test('R-05/R-09: the drawn arrangement reaches the flow shape', () => {
	// Three columns feed three sites; one column feeds one.
	assert.equal(shapeOf(steppedTo(score('column-half-ring'), [1600]), 'jet').siteCount, 3);
	assert.equal(shapeOf(steppedTo(score('column-unbalanced'), [1600]), 'jet').siteCount, 1);
	// R-09's valve exhausts through its aperture, not out of the chevrons that
	// opened it, so it stands on no site and its root is thrown clear of centre.
	const valve = steppedTo(score('region-sector'), [1600]);
	assert.equal(shapeOf(valve, 'jet').siteCount, 0);
	const root = reportOf(valve, 'jet').from;
	assert.ok(Math.hypot(root.x, root.y) > 0.5, 'the valve is rooted at the seal centre');
});

test('R-07: one sector per dispersion sign, and the sheet leaves the ring', () => {
	const cast = steppedTo(score('dispersion'), [2600]);
	assert.equal(shapeOf(cast, 'fan').siteCount, 2);
	assert.ok(reportOf(cast, 'fan').detail.outer > 1, 'the sheet stayed inside the ring');
});

test('a balanced column stands well past the ring for the whole cast', () => {
	const built = score('column-balanced');
	for (const beat of ['strike', 'body', 'release'] as const) {
		const [stop] = beatStops(built, [beat]);
		assert.ok(jetProbe(steppedTo(built, [stop])).standing > 1.5, `${beat} stands short`);
	}
});

test('R-18: a declared coupling catches the column at the holder shell', () => {
	const built = score('column-levitation');
	const hold = built.layers[0].tracks.find(
		(track): track is Track<'hold'> => track.kind === 'hold'
	)!;
	const shell = hold.params.at.z + hold.params.radius * 2;
	const stops = [1100, 1600, 2600, 3000];

	const free = steppedTo(built, stops, { couple: false });
	const caught = steppedTo(built, stops);
	assert.ok(jetProbe(free).tipZ > shell, 'an uncoupled column should overrun the shell');
	assert.ok(jetProbe(caught).tipZ < shell, 'a coupled column should be reeled in');
	assert.ok(jetProbe(caught).tipZ > hold.params.at.z * 0.5, 'caught at the grip, not switched off');

	// A preset the plan declared no coupling for performs identically either way.
	const balanced = score('column-balanced');
	assert.deepEqual(
		reportsOf(steppedTo(balanced, stops)),
		reportsOf(steppedTo(balanced, stops, { couple: false }))
	);
});

test('dispose stops every channel', () => {
	for (const presetId of ['column-balanced', 'dispersion', 'none']) {
		const cast = castFor(score(presetId));
		disposeCast(cast);
		for (const report of reportsOf(cast)) {
			assert.equal(report.marks, 0);
		}
	}
});
