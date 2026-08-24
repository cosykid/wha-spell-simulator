/**
 * The cell contract every performer keeps, whatever it performs.
 *
 * These are the rules `docs/animation-cells.md` and `docs/animation-hybrid.md`
 * state and a screenshot cannot catch: the clock is a product, a replay is
 * exact, the charge beat is silent for everything the seal manifests, the five
 * beats do not look alike, and a cell knows only its own track.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { BEAT_ORDER } from '../src/lib/cast/score/beats.js';
import { scoreTracks } from '../src/lib/cast/score/compileScore.js';
import { STAGE, cellFrameFor, stepsFor } from '../src/lib/cast/stage/frames.js';
import {
	advanceTo,
	castFor,
	disposeCast,
	insideBeat,
	performerOf,
	reportOf,
	reportsOf,
	scoreFor,
	steppedTo
} from './castHarness.js';
import type { SpellScore } from '../src/lib/types.js';

const SOURCE = { signature: 'test-cells', duration: 4 };

function score(presetId = 'column-balanced', sigil = 'fire'): SpellScore {
	return scoreFor(presetId, sigil, SOURCE);
}

/** The burst's own state, as a comparable snapshot. */
function burstProbe(presetId: string, stops: readonly number[]) {
	const cast = steppedTo(score(presetId), stops);
	const report = reportOf(cast, 'burst');
	return {
		ink: Number(report.ink.toFixed(6)),
		front: Number(report.detail.front.toFixed(6)),
		marks: report.marks,
		born: report.born
	};
}

test('the clock is a product of whole steps, never a running sum', () => {
	const cast = steppedTo(score(), [400, 1100, 2600]);
	assert.equal(cast.clock.tMs, cast.clock.steps * STAGE.stepMs);
	assert.equal(cast.clock.steps, stepsFor(2600));
});

test('stepping fresh to a timestamp matches stepping there incrementally', () => {
	assert.deepEqual(
		burstProbe('column-balanced', [2600]),
		burstProbe('column-balanced', [400, 1100, 1150, 2000, 2600])
	);
});

test('the same score builds the same performance twice', () => {
	assert.deepEqual(burstProbe('column-balanced', [1600]), burstProbe('column-balanced', [1600]));
});

test('R-01: nothing the seal manifests reaches a pixel during the charge', () => {
	const built = score();
	const chargeEnd = built.beats.charge.endMs;
	for (const atMs of [200, 600, chargeEnd - STAGE.stepMs]) {
		const cast = steppedTo(built, [atMs]);
		for (const performer of cast.performers) {
			if (performer.track.kind === 'shimmer') {
				continue;
			}
			const report = performer.cell.report();
			assert.equal(report.ink, 0, `${performer.track.id} is painting at ${atMs}ms`);
			// Absent, not merely dark: an accumulator that ran would show up here.
			assert.equal(report.born, 0, `${performer.track.id} laid a mark at ${atMs}ms`);
			assert.equal(report.marks, 0, `${performer.track.id} holds a mark at ${atMs}ms`);
		}
	}
});

test('R-01/R-02: the burst reads differently in each of its four remaining beats', () => {
	const built = score();
	const stops = BEAT_ORDER.filter((beat) => beat !== 'charge').map((beat) => {
		const window = built.beats[beat];
		return Math.round(((window.startMs + window.endMs) / 2 / STAGE.stepMs) * 1) * STAGE.stepMs;
	});
	const probes = stops.map((_, index) => burstProbe('column-balanced', stops.slice(0, index + 1)));

	// The strike is the whole spend, and the front it threw keeps spreading.
	assert.ok(probes[0].ink > probes[1].ink, 'the strike is louder than the body');
	for (let i = 1; i < probes.length; i += 1) {
		assert.ok(probes[i].front >= probes[i - 1].front, 'the front never draws back');
	}
	assert.equal(
		new Set(probes.map((probe) => JSON.stringify(probe))).size,
		probes.length,
		'two beats read identically'
	);
});

test('a frame carries its own track and nothing else', () => {
	const built = score();
	const burst = scoreTracks(built).find((track) => track.kind === 'burst')!;
	const shimmer = scoreTracks(built).find((track) => track.kind === 'shimmer')!;

	const charge = cellFrameFor(built, burst, 400);
	assert.equal(charge.beat, 'charge');
	assert.equal(charge.emission, 0);
	assert.equal(charge.drive, 0);
	assert.equal(charge.dtMs, STAGE.stepMs);

	const strike = built.beats.strike;
	const middle = cellFrameFor(built, burst, (strike.startMs + strike.endMs) / 2);
	assert.ok(Math.abs(middle.beatT - 0.5) < 1e-9);
	assert.ok(middle.emission > 0);
	assert.ok(middle.drive > 0);

	// R-10's medium is the one track whose emission opens in the charge.
	assert.ok(cellFrameFor(built, shimmer, 400).emission > 0);
});

test('every cell reports finite state over a seat it actually owns', () => {
	for (const presetId of ['column-balanced', 'pull-vortex', 'levitation', 'dispersion']) {
		const cast = steppedTo(score(presetId), [1600]);
		cast.performers.forEach((performer, index) => {
			const report = performer.cell.report();
			const numbers = [
				report.ink,
				report.at.x,
				report.at.y,
				report.at.z,
				report.from.x,
				report.from.y,
				report.from.z,
				report.tip.x,
				report.tip.y,
				report.tip.z,
				...Object.values(report.detail)
			];
			for (const value of numbers) {
				assert.ok(Number.isFinite(value), `${performer.track.id} reported ${value}`);
			}
			assert.ok(cast.substrate.channels[index].parcels > 0, `${performer.track.id} has no parcels`);
		});
	}
});

test('dispose stops the channel a cell was painting through', () => {
	const cast = castFor(score('column-balanced'));
	advanceTo(cast, 1600);
	assert.ok(
		reportsOf(cast).some((report) => report.marks > 0),
		'nothing was laid to release'
	);
	disposeCast(cast);
	for (const report of reportsOf(cast)) {
		assert.equal(report.marks, 0);
		assert.equal(report.born, 0);
	}
});

test('the medium performs the charge and the seal answers at the strike', () => {
	const built = score();
	const cast = castFor(built);
	advanceTo(cast, insideBeat(cast, 'charge', 0.8));
	assert.ok(reportOf(cast, 'shimmer').ink > 0, 'the medium is absent from its own beat');
	assert.equal(performerOf(cast, 'jet').cell.report().ink, 0);

	advanceTo(cast, insideBeat(cast, 'strike', 0.6));
	assert.ok(reportOf(cast, 'jet').ink > 0, 'the strike brought nothing');
});
