/**
 * The hold and the ambient medium, and the one coupling between cells.
 *
 * Four rulings live here. **R-01**: the charge beat belongs to the medium and to
 * nothing else. **R-16**: a rotor turns without a grip, so it holds nothing and
 * constrains nothing. **R-20**: the held mass approaches its capacity and never
 * reaches it. **R-18**: the ceiling a holder publishes is the whole of a
 * coupling, and it travels through the stage rather than between the cells.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { BEAT_ORDER } from '../src/lib/cast/score/beats.js';
import { STAGE, advanceCells, bindCouplings, newStageClock } from '../src/lib/cast/stage/frames.js';
import {
	advanceTo,
	castFor,
	disposeCast,
	performerOf,
	reportOf,
	reportsOf,
	scoreFor,
	steppedTo
} from './castHarness.js';
import type { HeadlessCast } from './castHarness.js';
import type { Cell, CellConstraint } from '../src/lib/cast/cells/cell.js';
import type { Beat, SpellScore, Track } from '../src/lib/types.js';

const SOURCE = { signature: 'test-hold', duration: 4 };

function score(presetId: string, sigil = 'water'): SpellScore {
	return scoreFor(presetId, sigil, SOURCE);
}

function beatStops(built: SpellScore, beats: readonly Beat[]): number[] {
	return beats.map((beat) => {
		const window = built.beats[beat];
		return Math.round((window.startMs + window.endMs) / 2 / STAGE.stepMs) * STAGE.stepMs;
	});
}

function holdProbe(cast: HeadlessCast) {
	const report = reportOf(cast, 'hold');
	return {
		ink: Number(report.ink.toFixed(5)),
		fill: Number(report.detail.fill.toFixed(5)),
		radius: Number(report.detail.radius.toFixed(5)),
		turned: Number(report.detail.turned.toFixed(5))
	};
}

test('R-01: the medium is alive in the charge and nothing else is', () => {
	const cast = steppedTo(score('column-levitation'), [850]);
	assert.ok(reportOf(cast, 'shimmer').ink > 0, 'the medium is absent from its own beat');
	for (const performer of cast.performers) {
		if (performer.track.kind !== 'shimmer') {
			assert.equal(performer.cell.report().ink, 0, performer.track.id);
		}
	}
});

test('R-01: the medium draws inward through the charge and is blown back at the strike', () => {
	const built = score('none');
	const early = reportOf(steppedTo(built, [300]), 'shimmer').detail;
	const late = reportOf(steppedTo(built, [900]), 'shimmer').detail;
	const strike = reportOf(steppedTo(built, [1150]), 'shimmer').detail;
	assert.ok(late.inhale > early.inhale, 'the medium should gather as the paper turns');
	assert.ok(strike.inhale < late.inhale, 'and be blown back once the seal answers');
});

test('R-10: the medium never dominates a frame, in any beat or any element', () => {
	for (const sigil of ['fire', 'earth', 'water', 'crystal']) {
		const built = score('column-balanced', sigil);
		const stops = beatStops(built, BEAT_ORDER);
		for (const [index] of stops.entries()) {
			const cast = steppedTo(built, stops.slice(0, index + 1));
			const medium = reportOf(cast, 'shimmer');
			assert.ok(medium.ink <= medium.detail.cap, `${sigil} medium past its own cap`);
		}
		// And against what it surrounds: at the strike the seal is far louder.
		const [, strike] = stops;
		const cast = steppedTo(built, [strike]);
		const loudest = Math.max(
			...cast.performers
				.filter(({ track }) => track.kind !== 'shimmer')
				.map(({ cell }) => cell.report().ink)
		);
		assert.ok(
			reportOf(cast, 'shimmer').ink < 0.5 * loudest,
			`${sigil} medium reads as loudly as the spell`
		);
	}
});

test('R-16: a rotor turns without a grip, and constrains nothing', () => {
	const built = score('levitation-pinwheel');
	const early = holdProbe(steppedTo(built, [1400]));
	const late = holdProbe(steppedTo(built, [2600]));
	assert.ok(Math.abs(late.turned) > Math.abs(early.turned), 'the rotor is not turning');
	assert.ok(late.turned > 1, 'and it should have turned a long way by the body');
	assert.equal(late.fill, 0, 'a rotor holds nothing');
	assert.equal(performerOf(steppedTo(built, [2600]), 'hold').cell.constraint?.() ?? null, null);
});

test('R-20: the held mass approaches its capacity and never reaches it', () => {
	const built = score('levitation');
	const cast = castFor(built);
	let previous = 0;
	for (let atMs = built.beats.strike.startMs; atMs < built.totalMs; atMs += 80) {
		advanceTo(cast, Math.round(atMs / STAGE.stepMs) * STAGE.stepMs);
		const ceiling = performerOf(cast, 'hold').cell.constraint?.();
		assert.ok(ceiling, 'a gripping hold should publish a ceiling');
		assert.ok(ceiling.closed >= previous, 'the grip should never open again');
		assert.ok(ceiling.closed <= 1, 'the grip should never pass fully closed');
		previous = ceiling.closed;
	}
	assert.ok(previous > 0.2, 'the ball should have filled a long way by the end');
	// Asymptotic, not a ramp into a clamp: the valve closes as the ball fills.
	assert.ok(previous < 1, 'the ball should approach capacity rather than reach it');
});

test('all five beats of a hold read differently', () => {
	const built = score('levitation');
	const stops = beatStops(built, BEAT_ORDER);
	const probes = stops.map((_, index) => holdProbe(steppedTo(built, stops.slice(0, index + 1))));
	assert.equal(new Set(probes.map((one) => JSON.stringify(one))).size, probes.length);
	assert.equal(probes[0].ink, 0, 'the charge belongs to the medium');
	for (let i = 2; i < probes.length; i += 1) {
		assert.ok(probes[i].fill >= probes[i - 1].fill, 'the ball emptied');
	}
	assert.ok(probes[4].ink < probes[2].ink, 'the afterglow does not dim');
});

test('R-18: the stage carries the ceiling, and neither cell sees the other', () => {
	const built = score('column-levitation');
	const cast = castFor(built, { couple: false });
	// A stand-in for whatever the plan captured, so what a captured cell is handed
	// is asserted rather than inferred from a form.
	const seen: { constraint: CellConstraint | null; binds: number } = { constraint: null, binds: 0 };
	const probe: Cell = {
		update() {},
		report: () => ({
			ink: 0,
			at: { x: 0, y: 0, z: 0 },
			from: { x: 0, y: 0, z: 0 },
			tip: { x: 0, y: 0, z: 0 },
			marks: 0,
			born: 0,
			detail: {}
		}),
		bind(constraint) {
			seen.constraint = constraint;
			seen.binds += 1;
		},
		dispose() {}
	};
	const jet = cast.performers.find(({ track }) => track.kind === 'jet')!;
	assert.equal(jet.track.capturedBy, 'hold-levitation');
	cast.performers = cast.performers.map((performer) =>
		performer === jet ? { ...performer, cell: probe } : performer
	);
	bindCouplings(cast.performers);
	advanceCells(cast.score, cast.performers, newStageClock(), 2600);

	assert.ok(seen.binds > 0, 'the captured cell was never handed a ceiling');
	const ceiling = seen.constraint;
	assert.ok(ceiling, 'a gripping hold should publish one');
	assert.ok(ceiling.radius > 0);
	assert.ok(ceiling.closed > 0);
	const hold = cast.performers.find(({ track }) => track.kind === 'hold')!.track as Track<'hold'>;
	// The locus never bobs: the shell stands still and the ball breathes inside it.
	assert.equal(ceiling.at.z, hold.params.at.z);
	assert.ok(
		Math.hypot(ceiling.at.x, ceiling.at.y, ceiling.at.z) + ceiling.radius <
			(jet.track as Track<'jet'>).params.reach,
		'the shell should sit inside the beam it caught'
	);
});

test('an uncaptured cell is never bound, and a rotor publishes nothing to bind', () => {
	const cast = steppedTo(score('levitation-pinwheel'), [2600]);
	for (const performer of cast.performers) {
		assert.equal(performer.holder, undefined, performer.track.id);
		assert.equal(performer.cell.constraint?.() ?? null, null, performer.track.id);
	}
});

test('stepping fresh to a timestamp matches stepping there incrementally', () => {
	for (const presetId of ['levitation', 'levitation-pinwheel', 'column-levitation', 'none']) {
		const built = score(presetId);
		assert.deepEqual(
			reportsOf(steppedTo(built, [2600])),
			reportsOf(steppedTo(built, [850, 1100, 1600, 2200, 2600])),
			presetId
		);
	}
});

test('the same score builds the same forms twice, and dispose empties them', () => {
	const built = score('levitation');
	assert.deepEqual(reportsOf(steppedTo(built, [1600])), reportsOf(steppedTo(built, [1600])));
	const cast = steppedTo(built, [1600]);
	disposeCast(cast);
	for (const report of reportsOf(cast)) {
		assert.equal(report.marks, 0);
	}
});
