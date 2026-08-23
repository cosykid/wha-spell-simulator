/**
 * The two directional cells: the beam that performs an aimed column (R-05) and
 * the fan that performs dispersion (R-07, R-08).
 *
 * What is pinned here is what `docs/animation-cells.md` rules and a screenshot
 * cannot catch: the charge is silent, the five beats differ, a replay is exact,
 * and the drawn arrangement reaches the form — three columns build three
 * converging strands where one column builds one, and the column they feed
 * stands well past the ring rather than dying inside it.
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
import { hashSeed } from '../src/lib/cast/stage/rng.js';
import { resolvePlan } from '../src/lib/compiler/plan/resolvePlan.js';
import { readPresetSeal } from '../src/lib/ui/spellEffectLab.js';
import { presetById } from '../src/lib/ui/spellEffectLabPresets.js';
import type { Beat, ScoreTrack, SpellScore } from '../src/lib/types.js';

const SOURCE = { signature: 'test-directional', duration: 4 };

function scoreFor(presetId: string, sigil: string): SpellScore {
	return compileScore(resolvePlan(readPresetSeal(presetById(presetId).signs, sigil)), SOURCE);
}

function performersFor(score: SpellScore): Performer[] {
	const look = lookRow({ sigil: score.sigil, element: score.element });
	return scoreTracks(score).map((track, index) => ({
		track,
		cell: cellFor(track, { seed: hashSeed(`${score.signature}:${index}`), look, quality: 0.8 })
	}));
}

function steppedTo(score: SpellScore, stops: readonly number[]): Performer[] {
	const performers = performersFor(score);
	const clock = newStageClock();
	for (const stop of stops) {
		advanceCells(score, performers, clock, stop);
	}
	return performers;
}

function cellOf(performers: Performer[], kind: ScoreTrack['kind']) {
	const performer = performers.find((candidate) => candidate.track.kind === kind);
	assert.ok(performer, `expected a ${kind} track`);
	return performer.cell;
}

function uniformsOf(group: THREE.Group, name: string): Record<string, { value: unknown }> {
	const mesh = group.getObjectByName(name) as THREE.Mesh | undefined;
	assert.ok(mesh, `expected a ${name} mesh`);
	return (mesh.material as THREE.ShaderMaterial).uniforms;
}

function numberAt(group: THREE.Group, name: string, uniform: string): number {
	return uniformsOf(group, name)[uniform].value as number;
}

/** How many distinct values one baked attribute holds: the form's structural fold. */
function distinctValues(group: THREE.Group, name: string, attribute: string): number {
	const mesh = group.getObjectByName(name) as THREE.Mesh;
	const buffer = mesh.geometry.getAttribute(attribute);
	const seen = new Set<string>();
	for (let index = 0; index < buffer.count; index += 1) {
		const parts: number[] = [];
		for (let item = 0; item < buffer.itemSize; item += 1) {
			parts.push(Math.round(buffer.getComponent(index, item) * 1e4));
		}
		seen.add(parts.join(':'));
	}
	return seen.size;
}

/** Everything the beam accumulated, read off the forms it built. */
function beamProbe(performers: Performer[]) {
	const group = cellOf(performers, 'jet').group;
	return {
		visible: group.visible,
		length: numberAt(group, 'beam-spine', 'uLength'),
		width: numberAt(group, 'beam-spine', 'uWidth'),
		alpha: numberAt(group, 'beam-spine', 'uAlpha'),
		tongue: numberAt(group, 'beam-spine', 'uTip'),
		flow: numberAt(group, 'beam-spine', 'uFlow'),
		sheath: numberAt(group, 'beam-ribbons', 'uAlpha'),
		feather: numberAt(group, 'beam-ribbons', 'uFeather'),
		feeders: numberAt(group, 'beam-feeders', 'uAlpha')
	};
}

/** Everything the fan accumulated, read off its sheet. */
function fanProbe(performers: Performer[]) {
	const group = cellOf(performers, 'fan').group;
	return {
		visible: group.visible,
		inner: numberAt(group, 'fan-sheet', 'uInner'),
		outer: numberAt(group, 'fan-sheet', 'uOuter'),
		lift: numberAt(group, 'fan-sheet', 'uLift'),
		alpha: numberAt(group, 'fan-sheet', 'uAlpha'),
		flow: numberAt(group, 'fan-sheet', 'uFlow'),
		sparks: numberAt(group, 'fan-sparks', 'uAlpha')
	};
}

/** The middle of a beat, on the cast clock. */
function midpointOf(score: SpellScore, beat: Beat): number {
	const window = score.beats[beat];
	return window.startMs + (window.endMs - window.startMs) / 2;
}

test('R-01: neither cell manifests anything through the charge', () => {
	const beam = scoreFor('column-balanced', 'fire');
	const fan = scoreFor('dispersion', 'light');
	for (const stop of [200, 600, beam.beats.charge.endMs - STAGE.stepMs]) {
		const shaft = beamProbe(steppedTo(beam, [stop]));
		assert.equal(shaft.visible, false, `the beam showed at ${stop}ms`);
		assert.equal(shaft.length, 0);
		assert.equal(shaft.alpha, 0);

		const sheet = fanProbe(steppedTo(fan, [stop]));
		assert.equal(sheet.visible, false, `the fan showed at ${stop}ms`);
		assert.equal(sheet.alpha, 0);
	}
});

test('the strike is an impulse: the tongue overshoots and the lip rears', () => {
	const beam = scoreFor('column-balanced', 'fire');
	const strike = beamProbe(steppedTo(beam, [midpointOf(beam, 'strike')]));
	const body = beamProbe(steppedTo(beam, [midpointOf(beam, 'body')]));
	assert.equal(strike.visible, true);
	assert.ok(strike.alpha > 0, 'the strike is lit');
	assert.ok(strike.tongue > body.tongue, 'the tongue is thrown hardest at the strike');
	assert.ok(strike.width > body.width, 'and the shaft flares while it punches');

	const fan = scoreFor('dispersion', 'light');
	const wave = fanProbe(steppedTo(fan, [fan.beats.strike.endMs - STAGE.stepMs]));
	const settled = fanProbe(steppedTo(fan, [fan.beats.body.endMs - STAGE.stepMs]));
	assert.ok(wave.lift > 0, 'the sheet leaves the paper as it snaps open');
	assert.ok(wave.lift > settled.lift, 'and its lip rears highest at the strike');
});

test('every beat after the charge reads differently, for both cells', () => {
	const played = BEAT_ORDER.filter((beat) => beat !== 'charge');

	const beam = scoreFor('column-half-ring', 'water');
	const shafts = played.map((beat) => beamProbe(steppedTo(beam, [midpointOf(beam, beat)])));
	for (const [index, shaft] of shafts.entries()) {
		assert.equal(shaft.visible, true, `${played[index]} should be on screen`);
		assert.ok(shaft.length > 0, `${played[index]} should stand`);
	}
	assert.equal(new Set(shafts.map((shaft) => JSON.stringify(shaft))).size, shafts.length);
	// R-02 gives the body the sustain, and the release the commit: the ribbons
	// feather back off the shaft only once the beam has let go.
	assert.ok(shafts[2].feather < shafts[1].feather, 'the sheath feathers through the release');
	assert.ok(shafts[3].alpha < shafts[1].alpha, 'and the afterglow dissipates');

	const fan = scoreFor('dispersion', 'light');
	const sheets = played.map((beat) => fanProbe(steppedTo(fan, [midpointOf(fan, beat)])));
	assert.equal(new Set(sheets.map((sheet) => JSON.stringify(sheet))).size, sheets.length);
	for (let index = 1; index < sheets.length; index += 1) {
		assert.ok(sheets[index].outer >= sheets[index - 1].outer, 'the front never draws back');
	}
	// The commit: the sheet lets go of its root and travels as a band.
	assert.ok(sheets[2].inner > sheets[1].inner, 'the release lets go of the root');
});

test('stepping fresh to a timestamp matches stepping there incrementally', () => {
	const beam = scoreFor('column-half-ring', 'water');
	assert.deepEqual(
		beamProbe(steppedTo(beam, [2600])),
		beamProbe(steppedTo(beam, [400, 1100, 1150, 2000, 2600]))
	);

	const fan = scoreFor('dispersion', 'light');
	assert.deepEqual(
		fanProbe(steppedTo(fan, [3000])),
		fanProbe(steppedTo(fan, [500, 1200, 2400, 3000]))
	);
});

test('the same score always builds the same forms', () => {
	const score = scoreFor('column-balanced', 'fire');
	assert.deepEqual(beamProbe(steppedTo(score, [1600])), beamProbe(steppedTo(score, [1600])));
});

test('R-05: the drawn arrangement reaches the form, three columns as three strands', () => {
	const three = steppedTo(scoreFor('column-half-ring', 'water'), [1600]);
	const one = steppedTo(scoreFor('column-unbalanced', 'wind'), [1600]);

	assert.equal(distinctValues(cellOf(three, 'jet').group, 'beam-feeders', 'aRoot'), 3);
	assert.equal(distinctValues(cellOf(one, 'jet').group, 'beam-feeders', 'aRoot'), 1);
	assert.ok(beamProbe(three).feeders > 0, 'the strands are lit while the beam runs');

	// R-09's valve exhausts through its aperture rather than out of a drawn column,
	// so it stands on no strand at all and its root is thrown clear of the center.
	const valve = steppedTo(scoreFor('region-sector', 'fire'), [1600]);
	const aimed = cellOf(valve, 'jet').group.getObjectByName('beam-aimed') as THREE.Group;
	assert.equal(distinctValues(cellOf(valve, 'jet').group, 'beam-feeders', 'aRoot'), 0);
	assert.ok(aimed.position.length() > 0.5, 'the gout leaves the rim, not the center');
});

test('R-07: one sector of sheet per drawn dispersion sign', () => {
	const fan = steppedTo(scoreFor('dispersion', 'light'), [1600]);
	assert.equal(distinctValues(cellOf(fan, 'fan').group, 'fan-sheet', 'aSeed'), 2);
	assert.ok(fanProbe(fan).sparks > 0, 'the leading edge is throwing garnish');
});

test('a balanced column stands well past the ring it was drawn in', () => {
	const score = scoreFor('column-balanced', 'fire');
	for (const beat of ['strike', 'body', 'release'] as const) {
		const shaft = beamProbe(steppedTo(score, [midpointOf(score, beat)]));
		assert.ok(shaft.length > 1.5, `the ${beat} beam only reached ${shaft.length} seal units`);
	}
});

test('disposing a directional cell empties its group', () => {
	for (const [presetId, sigil] of [
		['column-balanced', 'fire'],
		['dispersion', 'light'],
		['none', 'light']
	] as const) {
		const score = scoreFor(presetId, sigil);
		const performers = steppedTo(score, [1600]);
		for (const { cell } of performers) {
			cell.dispose();
			assert.equal(cell.group.children.length, 0);
		}
	}
});
