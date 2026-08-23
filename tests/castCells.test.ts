/**
 * The cell stage's two laws, below the WebGL line and testable without one: the
 * frame a cell is handed, and the replay contract that frame buys.
 *
 * The sim's step-identity test dies with the sim (`docs/animation-cells.md`);
 * this is its replacement. A fresh cast stepped to `t` and a cast stepped there
 * across several calls must agree on cell state probes, because the golden tiers
 * stand on a screenshot being independent of the frames sampled before it.
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
	cellFrameFor,
	newStageClock,
	stepsFor,
	type Performer
} from '../src/lib/cast/stage/frames.js';
import { hashSeed } from '../src/lib/cast/stage/rng.js';
import { resolvePlan } from '../src/lib/compiler/plan/resolvePlan.js';
import { readPresetSeal } from '../src/lib/ui/spellEffectLab.js';
import { presetById } from '../src/lib/ui/spellEffectLabPresets.js';
import type { ScoreTrack, SpellScore } from '../src/lib/types.js';

const SIGIL = 'fire';
const SOURCE = { signature: 'test-stage', duration: 4 };

function scoreFor(presetId = 'column-balanced'): SpellScore {
	return compileScore(resolvePlan(readPresetSeal(presetById(presetId).signs, SIGIL)), SOURCE);
}

function performersFor(score: SpellScore): Performer[] {
	const look = lookRow({ sigil: score.sigil, element: score.element });
	return scoreTracks(score).map((track, index) => ({
		track,
		cell: cellFor(track, { seed: hashSeed(`${score.signature}:${index}`), look, quality: 0.8 })
	}));
}

function trackOf(score: SpellScore, kind: ScoreTrack['kind']): ScoreTrack {
	const track = scoreTracks(score).find((candidate) => candidate.kind === kind);
	assert.ok(track, `expected a ${kind} track`);
	return track;
}

/**
 * Everything the burst cell accumulated, read off the form it built. The shock's
 * outer radius is the cell's only integrated state, so agreement here is the
 * replay contract.
 */
function burstProbe(performers: Performer[]) {
	const burst = performers.find((performer) => performer.track.kind === 'burst');
	assert.ok(burst, 'every score carries a burst');
	const shock = burst.cell.group.getObjectByName('burst-shock') as THREE.Mesh;
	const flash = burst.cell.group.getObjectByName('burst-flash') as THREE.Mesh;
	const shockUniforms = (shock.material as THREE.ShaderMaterial).uniforms;
	const flashUniforms = (flash.material as THREE.ShaderMaterial).uniforms;
	return {
		visible: burst.cell.group.visible,
		outer: shockUniforms.uOuter.value as number,
		inner: shockUniforms.uInner.value as number,
		phase: shockUniforms.uPhase.value as number,
		alpha: shockUniforms.uAlpha.value as number,
		height: shock.position.z,
		flashAlpha: flashUniforms.uAlpha.value as number,
		flashHeight: flash.scale.y
	};
}

function steppedTo(score: SpellScore, stops: readonly number[]) {
	const performers = performersFor(score);
	const clock = newStageClock();
	for (const stop of stops) {
		advanceCells(score, performers, clock, stop);
	}
	return { performers, clock };
}

test('the clock is a product of whole steps, never a running sum', () => {
	const score = scoreFor();
	const { clock } = steppedTo(score, [2600]);
	assert.equal(clock.tMs, clock.steps * STAGE.stepMs);
	assert.equal(clock.steps, stepsFor(2600));
});

test('stepping fresh to a timestamp matches stepping there incrementally', () => {
	const score = scoreFor();
	const fresh = steppedTo(score, [2600]);
	const incremental = steppedTo(score, [400, 1100, 1150, 2000, 2600]);

	assert.equal(fresh.clock.steps, incremental.clock.steps);
	assert.deepEqual(burstProbe(fresh.performers), burstProbe(incremental.performers));
});

test('the same score always builds the same form', () => {
	const score = scoreFor();
	assert.deepEqual(
		burstProbe(steppedTo(score, [1600]).performers),
		burstProbe(steppedTo(score, [1600]).performers)
	);
});

test('R-01: the burst cell shows nothing through the charge beat', () => {
	const score = scoreFor();
	const chargeEnd = score.beats.charge.endMs;
	for (const stop of [200, 600, chargeEnd - STAGE.stepMs]) {
		const probe = burstProbe(steppedTo(score, [stop]).performers);
		assert.equal(probe.visible, false, `visible at ${stop}ms`);
		assert.equal(probe.outer, 0);
	}
});

test('the burst cell reads differently in every beat after the charge', () => {
	const score = scoreFor();
	const seen = BEAT_ORDER.filter((beat) => beat !== 'charge').map((beat) => {
		const window = score.beats[beat];
		const at = window.startMs + (window.endMs - window.startMs) / 2;
		return { beat, probe: burstProbe(steppedTo(score, [at]).performers) };
	});

	for (const { beat, probe } of seen) {
		assert.equal(probe.visible, true, `${beat} should be on screen`);
		assert.ok(probe.outer > 0, `${beat} should have thrown a ring`);
	}
	// The strike is the only beat the flash lives in: its emission envelope is one
	// hump and R-01 gives the impulse to that beat alone.
	assert.ok(seen[0].probe.flashAlpha > 0, 'the strike flashes');
	for (const { beat, probe } of seen.slice(1)) {
		assert.equal(probe.flashAlpha, 0, `${beat} should not flash`);
	}
	// The shock spreads while the drive envelope pushes it and coasts to a stop
	// when that envelope closes at the end of `body`, then fades where it stands.
	assert.ok(seen[1].probe.outer > seen[0].probe.outer, 'the body keeps spreading');
	for (let i = 1; i < seen.length; i += 1) {
		assert.ok(seen[i].probe.outer >= seen[i - 1].probe.outer, 'and never contracts');
	}
	assert.ok(seen.at(-1)!.probe.alpha < seen[1].probe.alpha, 'and dissipates through the afterglow');

	// The whole point of a beat clock: no two beats may look the same.
	const shapes = seen.map(({ probe }) => JSON.stringify(probe));
	assert.equal(new Set(shapes).size, shapes.length, 'two beats rendered identically');
});

test('a cell frame carries only its own track envelopes and where it sits in the beats', () => {
	const score = scoreFor();
	const burst = trackOf(score, 'burst');
	const strikeMid = (score.beats.strike.startMs + score.beats.strike.endMs) / 2;

	const charge = cellFrameFor(score, burst, 400);
	assert.equal(charge.beat, 'charge');
	assert.equal(charge.emission, 0, 'the strike track is silent through the charge');
	assert.equal(charge.drive, 0);
	assert.equal(charge.dtMs, STAGE.stepMs);

	const strike = cellFrameFor(score, burst, strikeMid);
	assert.equal(strike.beat, 'strike');
	assert.ok(Math.abs(strike.beatT - 0.5) < 1e-9);
	assert.ok(strike.emission > 0);
	assert.ok(strike.drive > 0);

	// R-10's medium is the one track that opens in the charge, and the frame is
	// how a cell would find that out.
	assert.ok(cellFrameFor(score, trackOf(score, 'shimmer'), 400).emission > 0);
});

test('every kind a score can hold resolves to a cell that names its own track', () => {
	for (const presetId of ['column-balanced', 'pull-vortex', 'levitation', 'dispersion']) {
		const score = scoreFor(presetId);
		for (const { track, cell } of performersFor(score)) {
			assert.ok(cell.group, `${track.kind} has no group`);
			assert.equal(cell.group.name, `cell-${track.id}`);
		}
	}
});

test('disposing a cell empties its group', () => {
	const score = scoreFor();
	const performers = performersFor(score);
	advanceCells(score, performers, newStageClock(), 1600);
	for (const { cell } of performers) {
		cell.dispose();
		assert.equal(cell.group.children.length, 0);
	}
});
