/**
 * The two swirl cells — the vortex funnel and the intake stream — pinned at the
 * claims that are easy to break by accident: the charge beat, the sense of
 * rotation, the drawing's fold, the signed pull kernel, and replay.
 *
 * The funnel's tracks are written out by hand so the overrides under test are
 * explicit; `column-pinwheel` compiles the real one and the golden tier reads
 * that.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { BEAT_ORDER } from '../src/lib/cast/score/beats.js';
import { scoreTracks } from '../src/lib/cast/score/compileScore.js';
import { STAGE } from '../src/lib/cast/stage/frames.js';
import { castFor, disposeCast, reportOf, reportsOf, scoreFor, steppedTo } from './castHarness.js';
import type { HeadlessCast } from './castHarness.js';
import type { Beat, SpellScore, Track } from '../src/lib/types.js';

const SOURCE = { signature: 'test-swirl', duration: 4 };

/** Any score, for its beat windows. The tracks under test are supplied per case. */
function beatClock(presetId = 'pull-vortex', sigil = 'water'): SpellScore {
	return scoreFor(presetId, sigil, SOURCE);
}

/** A circulation track, written out because no preset draws tangential columns. */
function vortexTrack(overrides: Partial<Track<'vortex'>['params']> = {}): Track<'vortex'> {
	return {
		id: 'vortex-circulation',
		kind: 'vortex',
		population: 'own',
		params: {
			spin: 2.2,
			footRadius: 0.32,
			crownRadius: 0.7,
			height: 1.6,
			updraft: 1.98,
			feed: 1.54,
			spill: 1.1,
			symmetry: null,
			...overrides
		},
		emission: { from: 'strike', to: 'body', curve: 'attack', gain: 120 },
		drive: { from: 'strike', to: 'release', curve: 'leak', gain: 1 },
		look: 'body'
	};
}

/** A cast of one hand-built funnel, on a real beat clock. */
function funnelCast(
	overrides: Partial<Track<'vortex'>['params']> = {},
	stops: readonly number[] = [2600],
	sigil = 'water'
): HeadlessCast {
	const built = beatClock('pull-vortex', sigil);
	return steppedTo(built, stops, { tracks: [vortexTrack(overrides)] });
}

/** The intake track a preset compiles, so the signed kernel is read as shipped. */
function intakeCast(presetId: string, stops: readonly number[] = [2600]): HeadlessCast {
	const built = beatClock(presetId);
	const track = scoreTracks(built).find((candidate) => candidate.kind === 'intake');
	assert.ok(track, `${presetId} should compile an intake track`);
	return steppedTo(built, stops, { tracks: [track] });
}

function beatStops(built: SpellScore, beats: readonly Beat[]): number[] {
	return beats.map((beat) => {
		const window = built.beats[beat];
		return Math.round((window.startMs + window.endMs) / 2 / STAGE.stepMs) * STAGE.stepMs;
	});
}

function funnelProbe(cast: HeadlessCast) {
	const report = reportOf(cast, 'vortex');
	return {
		ink: Number(report.ink.toFixed(5)),
		height: Number(report.detail.height.toFixed(5)),
		crown: Number(report.detail.crown.toFixed(5)),
		foot: Number(report.detail.foot.toFixed(5)),
		spin: Number(report.detail.spin.toFixed(5))
	};
}

function streamProbe(cast: HeadlessCast) {
	const report = reportOf(cast, 'intake');
	return {
		ink: Number(report.ink.toFixed(5)),
		phase: Number(report.detail.phase.toFixed(5)),
		flash: Number(report.detail.flash.toFixed(5)),
		lift: Number(report.detail.lift.toFixed(5))
	};
}

test('R-01: neither swirl cell turns during the charge', () => {
	assert.equal(funnelProbe(funnelCast({}, [600])).ink, 0);
	assert.equal(funnelProbe(funnelCast({}, [600])).spin, 0);
	assert.equal(streamProbe(intakeCast('pull-inward', [600])).ink, 0);
	assert.equal(streamProbe(intakeCast('pull-inward', [600])).phase, 0);
});

test('R-05: the sense of rotation follows the sign of the circulation', () => {
	const counter = reportOf(funnelCast({ spin: 2.2 }), 'vortex').detail;
	const clockwise = reportOf(funnelCast({ spin: -2.2 }), 'vortex').detail;
	assert.ok(counter.spin > 0);
	assert.ok(clockwise.spin < 0);
	assert.ok(Math.abs(counter.spin - -clockwise.spin) < 1e-9, 'the two senses are not mirrors');
	assert.ok(counter.pitch > 0 && clockwise.pitch < 0, 'the winding does not follow the spin');
});

test('R-05: the drawing fold snaps the arm count, and a look row fills in for none', () => {
	const armsFor = (symmetry: number | null, sigil = 'water') =>
		reportOf(funnelCast({ symmetry }, [2600], sigil), 'vortex').detail.arms;
	assert.equal(armsFor(4), 4);
	assert.equal(armsFor(6), 6);
	assert.equal(armsFor(12), 6, 'a twelve-fold seal still reads as a funnel');
	assert.equal(armsFor(2), 3, 'below three a funnel stops reading as one');
	// With no fold to honour the row's own banding decides, so two elements differ.
	assert.equal(armsFor(null, 'water'), 6);
	assert.equal(armsFor(null, 'fire'), 3);
});

test('R-05: strength stands the funnel up and tightens its foot', () => {
	const strong = reportOf(funnelCast({ height: 1.6 }), 'vortex').detail;
	const weak = reportOf(funnelCast({ height: 0.56 }), 'vortex').detail;
	assert.ok(strong.height > weak.height * 2);
	assert.ok(weak.crown > strong.crown, 'a weak swirl should be the wider whirl');
	assert.ok(weak.foot > strong.foot, 'and the looser footed one');
	assert.ok(Math.abs(weak.pitch) > Math.abs(strong.pitch), 'and the more tightly wound');
});

test('stepping fresh to a timestamp matches stepping there incrementally', () => {
	for (const spin of [2.2, -1.1]) {
		assert.deepEqual(
			reportsOf(funnelCast({ spin }, [2600])),
			reportsOf(funnelCast({ spin }, [1100, 1600, 2200, 2600])),
			`spin ${spin}`
		);
	}
	for (const presetId of ['pull-inward', 'pull-inverted', 'pull-vortex']) {
		assert.deepEqual(
			reportsOf(intakeCast(presetId, [2600])),
			reportsOf(intakeCast(presetId, [1100, 1600, 2200, 2600])),
			presetId
		);
	}
});

test('ground truth 7: a negative draw reverses the same kernel rather than forking it', () => {
	const inward = reportOf(intakeCast('pull-inward'), 'intake').detail;
	const pushed = reportOf(intakeCast('pull-inverted'), 'intake').detail;
	assert.equal(inward.outward, 0);
	assert.ok(inward.from > inward.to, 'an inward pull should run from far to near');
	assert.equal(pushed.outward, 1);
	assert.ok(pushed.from < pushed.to, 'a push should run from near to far');
	assert.equal(inward.from, pushed.to, 'one signed kernel, not two forms');
	assert.equal(inward.to, pushed.from);
});

test('ground truth 7: only the twist turns and only the twist lifts', () => {
	const straight = reportOf(intakeCast('pull-inward'), 'intake').detail;
	const slanted = reportOf(intakeCast('pull-vortex'), 'intake').detail;
	assert.ok(Math.abs(straight.turn) < 1e-6);
	assert.ok(Math.abs(slanted.turn) > 1);
	assert.ok(straight.lift < 1e-6);
	assert.ok(slanted.lift > 0);
});

test('all five beats of a funnel and a stream read differently', () => {
	const built = beatClock();
	const stops = beatStops(built, BEAT_ORDER);
	const funnels = stops.map((_, index) => funnelProbe(funnelCast({}, stops.slice(0, index + 1))));
	assert.equal(new Set(funnels.map((one) => JSON.stringify(one))).size, funnels.length);
	assert.ok(funnels[1].height > funnels[2].height, 'the strike should overshoot the body');
	assert.ok(funnels[3].height > funnels[2].height, 'the release should stretch it taller');
	assert.ok(funnels[4].crown > funnels[3].crown, 'the afterglow should let it unwind');
	assert.ok(funnels[4].ink < funnels[2].ink, 'and dim');

	const streams = stops.map((_, index) =>
		streamProbe(intakeCast('pull-inward', stops.slice(0, index + 1)))
	);
	assert.equal(new Set(streams.map((one) => JSON.stringify(one))).size, streams.length);
	// The mouth blooms as the first matter lands and is shut by the release.
	assert.ok(streams[1].flash > 0);
	assert.ok(streams[2].flash > 0);
	assert.equal(streams[3].flash, 0);
	assert.equal(streams[4].flash, 0);
	assert.ok(streams[4].ink < streams[2].ink);
});

test('dispose stops every channel', () => {
	const cast = castFor(beatClock(), { tracks: [vortexTrack()] });
	disposeCast(cast);
	assert.equal(reportsOf(cast)[0].marks, 0);
});
