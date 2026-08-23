/**
 * The two swirl cells — the vortex funnel and the intake streamlines — pinned at
 * the claims that are easy to break by accident: the charge beat, the sense of
 * rotation, the drawing's fold, the signed pull kernel, and replay.
 *
 * No lab preset compiles a `vortex` track (R-05's circulation is a column-family
 * aggregate and no preset draws tangential columns), so the funnel's tracks are
 * written out here the way `tests/golden/castProbes.ts` writes its pinwheel.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import type * as THREE from 'three';

import { compileScore, scoreTracks } from '../src/lib/cast/score/compileScore.js';
import { BEAT_ORDER } from '../src/lib/cast/score/beats.js';
import { lookRow } from '../src/lib/cast/looks/table.js';
import { cellFor } from '../src/lib/cast/cells/registry.js';
import {
	STAGE,
	advanceCells,
	newStageClock,
	type Performer
} from '../src/lib/cast/stage/frames.js';
import { hashSeed } from '../src/lib/cast/rng.js';
import { resolvePlan } from '../src/lib/compiler/plan/resolvePlan.js';
import { readPresetSeal } from '../src/lib/ui/spellEffectLab.js';
import { presetById } from '../src/lib/ui/spellEffectLabPresets.js';
import type { Cell } from '../src/lib/cast/cells/cell.js';
import type { ScoreTrack, SpellScore, Track } from '../src/lib/types.js';

const SOURCE = { signature: 'test-swirl', duration: 4 };

/** Any score, for its beat windows. The tracks under test are supplied per case. */
function beatClock(presetId = 'pull-vortex', sigil = 'water'): SpellScore {
	return compileScore(resolvePlan(readPresetSeal(presetById(presetId).signs, sigil)), SOURCE);
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

/** The intake track a preset compiles, so the signed kernel is read as shipped. */
function intakeTrack(presetId: string): Track<'intake'> {
	const track = scoreTracks(beatClock(presetId)).find((candidate) => candidate.kind === 'intake');
	assert.ok(track, `${presetId} should compile an intake track`);
	return track as Track<'intake'>;
}

function performerFor(track: ScoreTrack, sigil = 'water'): Performer {
	const look = lookRow({ sigil, element: null });
	return {
		track,
		cell: cellFor(track, { seed: hashSeed(`swirl:${track.id}`), look, quality: 0.8 })
	};
}

function uniformsOf(cell: Cell, name: string): Record<string, { value: unknown }> {
	const mesh = cell.group.getObjectByName(name) as THREE.Mesh | undefined;
	assert.ok(mesh, `expected a ${name}`);
	return (mesh.material as THREE.ShaderMaterial).uniforms;
}

/** Everything the funnel accumulated, read off the arms and the floor it built. */
function funnelProbe(cell: Cell) {
	const arms = uniformsOf(cell, 'vortex-arms-ink');
	const floor = uniformsOf(cell, 'vortex-floor');
	return {
		visible: cell.group.visible,
		phase: arms.uPhase.value as number,
		arms: arms.uArms.value as number,
		pitch: arms.uPitch.value as number,
		foot: arms.uFoot.value as number,
		crown: arms.uCrown.value as number,
		height: arms.uHeight.value as number,
		alpha: arms.uAlpha.value as number,
		lit: arms.uLit.value as number,
		curl: floor.uCurl.value as number,
		floorAlpha: floor.uAlpha.value as number
	};
}

/** Everything the streamlines accumulated. `from`/`to` are the signed kernel. */
function streamProbe(cell: Cell) {
	const flow = uniformsOf(cell, 'intake-streamlines');
	return {
		visible: cell.group.visible,
		phase: flow.uFlow.value as number,
		from: flow.uFrom.value as number,
		to: flow.uTo.value as number,
		outward: flow.uOutward.value as number,
		turn: flow.uTurn.value as number,
		lift: flow.uLift.value as number,
		alpha: flow.uAlpha.value as number,
		flash: flow.uFlash.value as number
	};
}

function steppedTo(track: ScoreTrack, stops: readonly number[], sigil = 'water'): Cell {
	const score = beatClock();
	const performer = performerFor(track, sigil);
	const clock = newStageClock();
	for (const stop of stops) {
		advanceCells(score, [performer], clock, stop);
	}
	return performer.cell;
}

/** The middle of each beat but the charge, in order. */
function beatMidpoints(score: SpellScore): Array<{ beat: string; at: number }> {
	return BEAT_ORDER.filter((beat) => beat !== 'charge').map((beat) => {
		const window = score.beats[beat];
		return { beat, at: window.startMs + (window.endMs - window.startMs) / 2 };
	});
}

test('R-01: neither swirl cell manifests during the charge', () => {
	const score = beatClock();
	const chargeEnd = score.beats.charge.endMs;
	for (const stop of [200, 700, chargeEnd - STAGE.stepMs]) {
		const funnel = funnelProbe(steppedTo(vortexTrack(), [stop]));
		assert.equal(funnel.visible, false, `funnel visible at ${stop}ms`);
		assert.equal(funnel.phase, 0, 'the funnel has not begun to turn');

		// The ruling: intake is ambient by law, but R-01 gives the charge's
		// "ambient medium draws inward" to the one track whose emission opens
		// there, which is `shimmer`. Intake's own envelopes are both zero here.
		const stream = streamProbe(steppedTo(intakeTrack('pull-vortex'), [stop]));
		assert.equal(stream.visible, false, `streamlines visible at ${stop}ms`);
		assert.equal(stream.phase, 0, 'no stroke has travelled');
	}
});

test('the sense of rotation follows the sign of the spin', () => {
	const bodyMid = 2060;
	const counter = funnelProbe(steppedTo(vortexTrack({ spin: 2.2 }), [bodyMid]));
	const clockwise = funnelProbe(steppedTo(vortexTrack({ spin: -2.2 }), [bodyMid]));

	assert.ok(counter.phase > 0, 'a positive spin turns counter-clockwise');
	assert.ok(clockwise.phase < 0, 'a negative spin turns the other way');
	assert.ok(Math.abs(counter.phase - -clockwise.phase) < 1e-9, 'and at the same rate');
	// The arms wind and the floor sweeps the way the funnel turns, or the shading
	// and the silhouette disagree about which way it is going.
	assert.ok(counter.pitch > 0 && clockwise.pitch < 0, 'the arms wind with the spin');
	assert.ok(counter.curl > 0 && clockwise.curl < 0, 'the floor sweeps with the spin');
});

test('the arms follow the drawing n-fold snap, clamped to what reads as a funnel', () => {
	const armsFor = (symmetry: number | null, sigil = 'water') =>
		funnelProbe(steppedTo(vortexTrack({ symmetry }), [2060], sigil)).arms;

	assert.equal(armsFor(4), 4);
	assert.equal(armsFor(6), 6);
	assert.equal(armsFor(12), 6, 'a twelve-fold seal still turns on six arms');
	assert.equal(armsFor(2), 3, 'and a two-fold one on three');
	// With no fold to follow, the material's own banding decides: water is the
	// most banded row in the table, fire carries none at all.
	assert.equal(armsFor(null, 'water'), 6);
	assert.equal(armsFor(null, 'fire'), 3);
});

test('strength stands the funnel up: a weak swirl is a flat wide whirl', () => {
	const strong = funnelProbe(steppedTo(vortexTrack({ height: 1.6 }), [2060]));
	const weak = funnelProbe(steppedTo(vortexTrack({ height: 0.56 }), [2060]));

	assert.ok(strong.height > weak.height * 2, 'the strong one stands');
	assert.ok(weak.crown > strong.crown, 'the weak one spreads instead');
	assert.ok(weak.foot > strong.foot, 'and never tightens its foot');
	assert.ok(Math.abs(weak.pitch) > Math.abs(strong.pitch), 'a flat whirl wraps more times');
});

test('stepping fresh to a timestamp matches stepping there incrementally', () => {
	for (const track of [vortexTrack(), vortexTrack({ spin: -1.4, symmetry: 5 })]) {
		assert.deepEqual(
			funnelProbe(steppedTo(track, [2600])),
			funnelProbe(steppedTo(track, [400, 1100, 1150, 2000, 2600]))
		);
	}
	for (const presetId of ['pull-vortex', 'pull-inward', 'pull-inverted']) {
		const track = intakeTrack(presetId);
		assert.deepEqual(
			streamProbe(steppedTo(track, [2600])),
			streamProbe(steppedTo(track, [400, 1100, 1150, 2000, 2600])),
			presetId
		);
	}
});

test('a negative draw reverses the streamlines into an outward push', () => {
	const inward = streamProbe(steppedTo(intakeTrack('pull-inward'), [2060]));
	const pushed = streamProbe(steppedTo(intakeTrack('pull-inverted'), [2060]));

	assert.equal(inward.outward, 0);
	assert.ok(inward.from > inward.to, 'a draw runs from outside the seal to its mouth');
	assert.equal(pushed.outward, 1);
	assert.ok(pushed.from < pushed.to, 'and a push runs the same road the other way');
	assert.equal(inward.from, pushed.to, 'one signed kernel, not two forms');
	assert.equal(inward.to, pushed.from);
});

test('a slanted pull turns and climbs where a straight one runs flat', () => {
	const straight = streamProbe(steppedTo(intakeTrack('pull-inward'), [2060]));
	const slanted = streamProbe(steppedTo(intakeTrack('pull-vortex'), [2060]));

	assert.ok(Math.abs(straight.turn) < 1e-6, 'a straight pull draws straight in');
	assert.ok(Math.abs(slanted.turn) > 1, 'a slanted one spirals');
	assert.ok(straight.lift < 1e-6 && slanted.lift > 0, 'and only the twist lifts');
});

test('every beat after the charge reads differently, in both cells', () => {
	const score = beatClock();
	const funnel = beatMidpoints(score).map(({ beat, at }) => ({
		beat,
		probe: funnelProbe(steppedTo(vortexTrack(), [at]))
	}));
	const stream = beatMidpoints(score).map(({ beat, at }) => ({
		beat,
		probe: streamProbe(steppedTo(intakeTrack('pull-vortex'), [at]))
	}));

	for (const { beat, probe } of funnel) {
		assert.equal(probe.visible, true, `the funnel should stand in ${beat}`);
		assert.ok(probe.alpha > 0, `${beat} should be inked`);
	}
	// The strike throws the funnel past where it settles, the release lets it
	// stretch, and the afterglow unwinds it wider than it ever stood.
	assert.ok(funnel[0].probe.height > funnel[1].probe.height, 'the strike overshoots');
	assert.ok(funnel[2].probe.height > funnel[1].probe.height, 'the release stretches');
	assert.ok(funnel[3].probe.crown > funnel[2].probe.crown, 'the afterglow spreads');
	assert.ok(funnel[3].probe.alpha < funnel[1].probe.alpha, 'and dissipates');

	// The mouth is the intake's event: it flares at the strike, holds through the
	// body, and is closed by the time the drive lets go.
	assert.ok(stream[0].probe.flash > 0 && stream[1].probe.flash > 0, 'the mouth swallows');
	assert.equal(stream[2].probe.flash, 0, 'the release closes it');
	assert.equal(stream[3].probe.flash, 0, 'and the afterglow keeps it closed');
	assert.ok(stream[3].probe.alpha < stream[1].probe.alpha, 'the strokes fade out');

	for (const seen of [funnel, stream]) {
		const shapes = seen.map(({ probe }) => JSON.stringify(probe));
		assert.equal(new Set(shapes).size, shapes.length, 'two beats rendered identically');
	}
});

test('disposing a swirl cell leaves no children behind', () => {
	for (const track of [vortexTrack(), intakeTrack('pull-vortex')]) {
		const cell = steppedTo(track, [2060]);
		cell.dispose();
		assert.equal(cell.group.children.length, 0);
	}
});
