/**
 * The hold and ambient cells, and the coupling that binds them to anything else:
 * the three rulings that can be read off a cell's own state without a GPU.
 *
 * R-01 gives the charge to the ambient medium alone. R-16 turns a rotor that
 * grips nothing. R-20 fills the held ball toward a capacity it never passes, and
 * that fill is the ceiling the stage carries to whatever the plan said this hold
 * captured.
 *
 * The fourth thing pinned here is the one the phase-5 diagnosis asked for: the
 * medium may not dominate a frame, in any beat, ever.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import type * as THREE from 'three';

import { compileScore, scoreTracks } from '../src/lib/cast/score/compileScore.js';
import { lookRow } from '../src/lib/cast/looks/table.js';
import { cellFor } from '../src/lib/cast/cells/registry.js';
import {
	STAGE,
	advanceCells,
	bindCouplings,
	newStageClock,
	type Performer
} from '../src/lib/cast/stage/frames.js';
import { hashSeed } from '../src/lib/cast/rng.js';
import { resolvePlan } from '../src/lib/compiler/plan/resolvePlan.js';
import { readPresetSeal } from '../src/lib/ui/spellEffectLab.js';
import { presetById } from '../src/lib/ui/spellEffectLabPresets.js';
import type { Cell, CellConstraint } from '../src/lib/cast/cells/cell.js';
import type { Beat, ScoreTrack, SpellScore } from '../src/lib/types.js';

const SOURCE = { signature: 'test-hold', duration: 4 };

function scoreFor(presetId: string, sigil = 'fire'): SpellScore {
	return compileScore(resolvePlan(readPresetSeal(presetById(presetId).signs, sigil)), SOURCE);
}

function performersFor(score: SpellScore): Performer[] {
	const look = lookRow({ sigil: score.sigil, element: score.element });
	const performers = scoreTracks(score).map((track, index) => ({
		track,
		cell: cellFor(track, { seed: hashSeed(`${score.signature}:${index}`), look, quality: 0.8 })
	}));
	bindCouplings(performers);
	return performers;
}

function steppedTo(score: SpellScore, stops: readonly number[]) {
	const performers = performersFor(score);
	const clock = newStageClock();
	for (const stop of stops) {
		advanceCells(score, performers, clock, stop);
	}
	return performers;
}

/** The middle of a beat, which is where a beat's own look is least ambiguous. */
function midOf(score: SpellScore, beat: Beat): number {
	const window = score.beats[beat];
	return window.startMs + (window.endMs - window.startMs) / 2;
}

function cellOf(performers: readonly Performer[], kind: ScoreTrack['kind']): Cell {
	const performer = performers.find((candidate) => candidate.track.kind === kind);
	assert.ok(performer, `expected a ${kind} track`);
	return performer.cell;
}

function uniformsOf(cell: Cell, name: string): Record<string, { value: unknown }> {
	const mesh = cell.group.getObjectByName(name) as THREE.Mesh | undefined;
	assert.ok(mesh, `expected a ${name} mesh`);
	return (mesh.material as THREE.ShaderMaterial).uniforms;
}

function numberAt(cell: Cell, name: string, uniform: string): number {
	return uniformsOf(cell, name)[uniform].value as number;
}

/** Everything the hold cell accumulated, read off the forms it built. */
function holdProbe(performers: readonly Performer[]) {
	const hold = cellOf(performers, 'hold');
	return {
		visible: hold.group.visible,
		shellAlpha: numberAt(hold, 'hold-shell', 'uAlpha'),
		grip: numberAt(hold, 'hold-shell', 'uGrip'),
		pulse: numberAt(hold, 'hold-shell', 'uPulse'),
		bob: numberAt(hold, 'hold-shell', 'uPhase'),
		spin: numberAt(hold, 'hold-rings', 'uSpin'),
		ringAlpha: numberAt(hold, 'hold-rings', 'uAlpha'),
		wispAlpha: numberAt(hold, 'hold-wisps', 'uAlpha'),
		stop: numberAt(hold, 'hold-wisps', 'uStop'),
		constraint: hold.constraint?.() ?? null
	};
}

/** The medium's two layers, and the one number the dominance guard is about. */
function ambientProbe(performers: readonly Performer[]) {
	const ambient = cellOf(performers, 'shimmer');
	const haze = numberAt(ambient, 'ambient-haze', 'uAlpha');
	const motes = numberAt(ambient, 'ambient-motes', 'uAlpha');
	return {
		haze,
		motes,
		peak: numberAt(ambient, 'ambient-haze', 'uPeak'),
		inhale: numberAt(ambient, 'ambient-motes', 'uInhale'),
		/** Every lit thing the medium puts on screen at once. */
		presence: haze + motes
	};
}

/**
 * The two caps the guard stands on. The haze is one broad disc over the whole
 * plane, so it stays a whisper; the motes are a few dozen small strokes, so they
 * may be seen without covering anything.
 */
const AMBIENT_CEILING = { haze: 0.2, motes: 0.6 };

test('R-01: the medium is alive through the charge and nothing else is', () => {
	const score = scoreFor('levitation', 'earth');
	for (const stop of [200, 600, score.beats.charge.endMs - STAGE.stepMs]) {
		const performers = steppedTo(score, [stop]);
		const ambient = ambientProbe(performers);
		assert.ok(ambient.presence > 0, `the medium is dark at ${stop}ms`);
		for (const { track, cell } of performers) {
			if (track.kind !== 'shimmer') {
				assert.equal(cell.group.visible, false, `${track.kind} manifested at ${stop}ms`);
			}
		}
	}
});

test('R-01: the medium draws inward through the charge and is blown back by the strike', () => {
	const score = scoreFor('levitation', 'earth');
	const early = ambientProbe(steppedTo(score, [200]));
	const late = ambientProbe(steppedTo(score, [score.beats.charge.endMs - STAGE.stepMs]));
	const strike = ambientProbe(steppedTo(score, [score.beats.strike.endMs - STAGE.stepMs]));

	assert.ok(late.inhale > early.inhale, 'the gather never closed');
	assert.ok(late.peak < early.peak, 'the haze never pooled inward');
	assert.ok(late.presence > early.presence, 'the medium never brightened into its own beat');
	assert.ok(strike.inhale < late.inhale, 'the strike did not push the medium back');
});

test('the medium never dominates a frame', () => {
	for (const sigil of ['fire', 'earth', 'water', 'crystal']) {
		const score = scoreFor('levitation', sigil);
		const beats = ['charge', 'strike', 'body', 'release', 'afterglow'] as const;
		const seen = beats.map((beat) => ambientProbe(steppedTo(score, [midOf(score, beat)])));
		const peak = Math.max(...seen.map((probe) => probe.presence));

		// Low always, whatever the material, whatever the beat.
		for (const probe of seen) {
			assert.ok(probe.haze <= AMBIENT_CEILING.haze, `${sigil} haze reached ${probe.haze}`);
			assert.ok(probe.motes <= AMBIENT_CEILING.motes, `${sigil} motes reached ${probe.motes}`);
		}
		// And never far above its own background: the charge is its beat, not a show.
		const body = seen[2].presence;
		assert.ok(peak <= 3.2 * body, `${sigil} medium spiked to ${peak / body} of its body level`);
		// The claim itself: from the strike on, the spell out-reads the world. The
		// reference is the burst at its own body-beat peak, which is where the
		// spell's own manifestation is loudest and the medium has to give way.
		const burst = cellOf(steppedTo(score, [score.beats.body.startMs + STAGE.stepMs]), 'burst');
		const shock = numberAt(burst, 'burst-shock', 'uAlpha');
		assert.ok(body < 0.5 * shock, `${sigil} medium held ${body} against a shock of ${shock}`);
	}
});

test('R-16: a rotor with no grip still turns, and grips nothing', () => {
	const score = scoreFor('levitation-pinwheel', 'water');
	const early = holdProbe(steppedTo(score, [score.beats.strike.endMs]));
	const late = holdProbe(steppedTo(score, [midOf(score, 'body')]));

	assert.ok(Math.abs(late.spin) > Math.abs(early.spin), 'the rings never turned');
	assert.ok(Math.abs(late.spin) > 1, `the rotor only turned ${late.spin} radians`);
	assert.ok(late.ringAlpha > 0, 'the rings are not on screen');
	// No grip, so no shell tension and nothing to constrain.
	assert.equal(late.grip, 0);
	assert.equal(late.constraint, null);
});

test('R-20: the held mass climbs toward capacity and never passes it', () => {
	const score = scoreFor('levitation', 'earth');
	const performers = performersFor(score);
	const clock = newStageClock();
	const hold = cellOf(performers, 'hold');

	let previous = 0;
	let filled = 0;
	for (let atMs = score.beats.strike.startMs; atMs <= score.totalMs; atMs += 80) {
		advanceCells(score, performers, clock, atMs);
		const closed = hold.constraint?.()?.closed ?? 0;
		assert.ok(closed >= previous, `the ball emptied at ${atMs}ms`);
		assert.ok(closed <= 1, `the ball overfilled to ${closed} at ${atMs}ms`);
		previous = closed;
		filled = closed;
	}
	assert.ok(filled > 0.2, `the ball only reached ${filled} of capacity`);
	// Asymptotic, not a ramp into a clamp: the valve closes as the ball fills.
	assert.ok(filled < 1, 'the ball hit its ceiling exactly, so nothing throttled');
});

test('the hold reads differently in every beat after the charge', () => {
	const score = scoreFor('levitation', 'earth');
	const seen = (['strike', 'body', 'release', 'afterglow'] as const).map((beat) => ({
		beat,
		probe: holdProbe(steppedTo(score, [midOf(score, beat)]))
	}));

	for (const { beat, probe } of seen) {
		assert.equal(probe.visible, true, `${beat} should be on screen`);
		assert.ok(probe.stop > 0, `${beat} should have a ball`);
	}
	// The grip closes over the strike and only there.
	assert.ok(seen[0].probe.pulse > 0, 'the strike does not pulse');
	for (const { beat, probe } of seen.slice(1)) {
		assert.equal(probe.pulse, 0, `${beat} should not pulse`);
	}
	assert.ok(seen.at(-1)!.probe.shellAlpha < seen[1].probe.shellAlpha, 'the shell never dims');
	const shapes = seen.map(({ probe }) => JSON.stringify(probe));
	assert.equal(new Set(shapes).size, shapes.length, 'two beats rendered identically');
});

/** A stand-in for a captured cell: it draws nothing and remembers its ceiling. */
function captureProbe(): Cell & { seen: CellConstraint | null; binds: number } {
	const group = { visible: true, children: [], clear() {} } as unknown as THREE.Group;
	return {
		group,
		seen: null,
		binds: 0,
		update() {},
		bind(constraint) {
			this.seen = constraint;
			this.binds += 1;
		},
		dispose() {}
	};
}

test('a declared coupling caps what the holder captured', () => {
	const score = scoreFor('column-levitation', 'water');
	const look = lookRow({ sigil: score.sigil, element: score.element });
	const probe = captureProbe();
	const performers: Performer[] = scoreTracks(score).map((track, index) => ({
		track,
		cell:
			track.kind === 'jet'
				? probe
				: cellFor(track, { seed: hashSeed(`${score.signature}:${index}`), look, quality: 0.8 })
	}));
	const jet = performers.find((performer) => performer.track.kind === 'jet');
	assert.ok(jet, 'column-levitation should compile a jet');
	assert.equal(jet.track.capturedBy, 'hold-levitation', 'the score did not declare the coupling');

	bindCouplings(performers);
	assert.equal(jet.holder?.track.id, 'hold-levitation');
	advanceCells(score, performers, newStageClock(), midOf(score, 'body'));

	assert.ok(probe.binds > 0, 'the stage never handed the ceiling over');
	const ceiling = probe.seen;
	assert.ok(ceiling, 'the holder published no ceiling');
	assert.ok(ceiling.radius > 0, 'the ceiling has no shell');
	assert.ok(ceiling.closed > 0, 'the grip never closed');
	const hold = scoreTracks(score).find((track) => track.kind === 'hold');
	assert.ok(hold?.kind === 'hold');
	assert.equal(ceiling.at.z, hold.params.at.z);
	// The point of the case: the beam's own reach runs past the ball, so the ball
	// is what stops it.
	const shellFace = Math.hypot(ceiling.at.x, ceiling.at.y, ceiling.at.z) + ceiling.radius;
	assert.ok(jet.track.kind === 'jet');
	assert.ok(shellFace < jet.track.params.reach, `the shell at ${shellFace} caps nothing`);
});

test('an uncaptured cell is never bound, and a rotor binds nothing', () => {
	const score = scoreFor('levitation-pinwheel', 'water');
	const performers = performersFor(score);
	for (const performer of performers) {
		assert.equal(performer.holder, undefined, `${performer.track.kind} was bound to a holder`);
	}
	advanceCells(score, performers, newStageClock(), midOf(score, 'body'));
	assert.equal(cellOf(performers, 'hold').constraint?.() ?? null, null);
});

test('stepping fresh to a timestamp matches stepping there incrementally', () => {
	for (const presetId of ['levitation', 'levitation-pinwheel', 'column-levitation', 'none']) {
		const score = scoreFor(presetId, 'earth');
		const fresh = steppedTo(score, [2600]);
		const incremental = steppedTo(score, [400, 1100, 1150, 2000, 2600]);
		assert.deepEqual(ambientProbe(fresh), ambientProbe(incremental), presetId);
		if (fresh.some((performer) => performer.track.kind === 'hold')) {
			assert.deepEqual(holdProbe(fresh), holdProbe(incremental), presetId);
		}
	}
});

test('the same score always builds the same forms', () => {
	const score = scoreFor('levitation', 'crystal');
	assert.deepEqual(holdProbe(steppedTo(score, [1900])), holdProbe(steppedTo(score, [1900])));
	assert.deepEqual(ambientProbe(steppedTo(score, [1900])), ambientProbe(steppedTo(score, [1900])));
});

test('disposing a hold or a medium empties its group', () => {
	const score = scoreFor('levitation', 'earth');
	const performers = steppedTo(score, [1900]);
	for (const kind of ['hold', 'shimmer'] as const) {
		const cell = cellOf(performers, kind);
		cell.dispose();
		assert.equal(cell.group.children.length, 0, `${kind} left children behind`);
	}
});
