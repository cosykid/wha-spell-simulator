/**
 * @file The cast golden tier: every lab preset's score, simulated and rasterized
 * at three timestamps inside three different beats.
 *
 * The gate this tier exists for is the redesign's replayability contract:
 * stepping fresh to a timestamp must be bit-identical to stepping there
 * incrementally. Everything else here is a byte comparison against a committed
 * PNG, the same way the field motion tier works.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
	CAST_DIR,
	CAST_FRAME_MS,
	castFileName,
	FIELD_PRESETS,
	landsOnStep,
	presetScore,
	renderPresetCast
} from './casts.js';
import { checkCastProbe, select } from './castProbeMetrics.js';
import { CAST_PROBES, castSubjects } from './castProbes.js';
import { newCast, simulateTo, stepTo } from '../../src/lib/cast/sim/cast.js';
import { scoreTracks } from '../../src/lib/cast/score/compileScore.js';
import type { CastProbe } from './castProbeMetrics.js';

const UPDATE_HINT = 'run `npm run test:golden:update` after reviewing the change';

/** The last whole simulation step still inside the 980ms charge beat. */
const LATE_CHARGE_MS = 975;

test('every cast frame timestamp lands on a whole simulation step', () => {
	for (const atMs of [...CAST_FRAME_MS, ...CAST_PROBES.map((probe) => probe.atMs)]) {
		assert.ok(landsOnStep(atMs), `${atMs}ms is not a whole simulation step`);
	}
});

test('every cast probe row names a subject that exists', () => {
	const subjects = castSubjects();
	for (const probe of CAST_PROBES) {
		assert.ok(
			subjects.has(probe.subject),
			`cast probe [${probe.rulingId}] names "${probe.subject}", which is not a cast subject`
		);
	}
});

test('every committed cast baseline names a real preset', () => {
	const expected = new Set(
		FIELD_PRESETS.flatMap((preset) => CAST_FRAME_MS.map((atMs) => castFileName(preset.id, atMs)))
	);
	for (const name of readdirSync(CAST_DIR).filter((file) => file.endsWith('.png'))) {
		assert.ok(expected.has(name), `cast baseline "${name}" has no lab preset: ${UPDATE_HINT}`);
	}
});

test('the charge beat holds the ambient medium and nothing the seal manifests', () => {
	// R-01: the charge beat is the portal tilt, and it is content — the medium
	// draws inward while the paper turns. R-02: nothing the seal manifests may
	// erupt until the tilt is over.
	assert.ok(landsOnStep(LATE_CHARGE_MS), `${LATE_CHARGE_MS}ms is not a whole simulation step`);
	for (const preset of FIELD_PRESETS) {
		const score = presetScore(preset);
		assert.ok(LATE_CHARGE_MS < score.beats.charge.endMs, `${preset.id} charges past the tilt`);
		const parcels = simulateTo(score, LATE_CHARGE_MS).parcels;
		const kindOf = new Map(scoreTracks(score).map((track) => [track.id, track.kind]));
		assert.ok(parcels.length > 0, `${preset.id} charges on an empty canvas`);
		for (const parcel of parcels) {
			assert.equal(
				kindOf.get(parcel.trackId),
				'shimmer',
				`${preset.id} manifested ${parcel.trackId} during charge`
			);
		}
	}
});

test('stepping fresh to a timestamp matches stepping there incrementally', () => {
	// The contract that makes golden frames cheap: a baseline never depends on
	// which timestamps were sampled before it.
	const last = CAST_FRAME_MS[CAST_FRAME_MS.length - 1];
	for (const preset of FIELD_PRESETS) {
		const score = presetScore(preset);
		const incremental = newCast(score);
		for (const atMs of CAST_FRAME_MS) {
			stepTo(score, incremental, atMs);
		}
		const fresh = simulateTo(score, last);
		assert.deepStrictEqual(incremental.parcels, fresh.parcels, `${preset.id} diverged`);
		assert.equal(incremental.steps, fresh.steps, `${preset.id} clock diverged`);
	}
});

test('two runs of the same cast render the same bytes', () => {
	for (const preset of FIELD_PRESETS) {
		const first = renderPresetCast(preset);
		const second = renderPresetCast(preset);
		for (let i = 0; i < first.length; i += 1) {
			assert.ok(first[i].png.equals(second[i].png), `${first[i].fileName} is not reproducible`);
		}
	}
});

for (const preset of FIELD_PRESETS) {
	test(`cast baseline: ${preset.id}`, () => {
		for (const frame of renderPresetCast(preset)) {
			const path = join(CAST_DIR, frame.fileName);
			assert.ok(existsSync(path), `no baseline ${frame.fileName}: ${UPDATE_HINT}`);
			assert.ok(
				readFileSync(path).equals(frame.png),
				`${frame.fileName} differs from its baseline: ${UPDATE_HINT}`
			);
		}
	});
}

/** Rows on one subject, cheapest to run against one cast stepped in order. */
function probesBySubject(): Map<string, CastProbe[]> {
	const grouped = new Map<string, CastProbe[]>();
	for (const probe of CAST_PROBES) {
		const rows = grouped.get(probe.subject) ?? [];
		rows.push(probe);
		grouped.set(probe.subject, rows);
	}
	for (const rows of grouped.values()) {
		rows.sort((a, b) => a.atMs - b.atMs);
	}
	return grouped;
}

for (const [subject, rows] of probesBySubject()) {
	test(`cast probes: ${subject}`, () => {
		const score = castSubjects().get(subject)!;
		const state = newCast(score);
		const failures: string[] = [];
		for (const probe of rows) {
			stepTo(score, state, probe.atMs);
			const result = checkCastProbe(probe, score, state.parcels);
			if (!result.passed) {
				failures.push(result.message);
			}
		}
		assert.equal(failures.length, 0, `\n${failures.join('\n')}`);
	});
}

test('a cast probe selector is R-10 vocabulary, and the two halves partition the world', () => {
	const score = castSubjects().get('pull-vortex')!;
	const parcels = simulateTo(score, 2600).parcels;
	const row = (of: CastProbe['of']): CastProbe => ({
		subject: 'pull-vortex',
		atMs: 2600,
		of,
		expect: { metric: 'parcels' },
		rulingId: 'R-10',
		claim: 'selector partition'
	});
	assert.equal(
		select(row('medium'), score, parcels).length + select(row('manifested'), score, parcels).length,
		parcels.length
	);
});
