/**
 * @file The cast golden tier: every lab preset's score, performed by its cells
 * and read back as text at four timestamps inside four different beats.
 *
 * The gate this tier exists for is the redesign's replayability contract:
 * stepping fresh to a timestamp must reach the same state as stepping there
 * incrementally. Everything else here is a comparison against a committed
 * baseline a reviewer can read.
 *
 * No pixels: the stage draws through WebGL and pure Node has no context, so the
 * look tier in `tests-e2e/golden-look.e2e.ts` owns pixel truth. What is asserted
 * here is what the cells did, which is what a renderer draws.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
	CAST_DIR,
	CAST_FRAME_MS,
	castFileName,
	LAB_PRESETS,
	landsOnStep,
	newPresetCast,
	renderPresetCast
} from './casts.js';
import { advanceCastTo } from './cellHarness.js';
import { frameText } from './cellState.js';
import { checkCastProbe, select } from './castProbeMetrics.js';
import { CAST_PROBES, castSubjects } from './castProbes.js';
import type { CastProbe } from './castProbeMetrics.js';

const UPDATE_HINT = 'run `npm run test:golden:update` after reviewing the change';

/** The last whole step still inside the 980ms charge beat. */
const LATE_CHARGE_MS = 975;

/** An unsourced row, for a gate that asks the metric layer the same question a row would. */
function ask(subject: string, atMs: number, expect: CastProbe['expect']): CastProbe {
	return { subject, atMs, of: 'medium', expect, rulingId: 'R-10', claim: 'gate' };
}

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
	const expected = new Set(LAB_PRESETS.map((preset) => castFileName(preset.id)));
	for (const name of readdirSync(CAST_DIR).filter((file) => file.endsWith('.txt'))) {
		assert.ok(expected.has(name), `cast baseline "${name}" has no lab preset: ${UPDATE_HINT}`);
	}
});

test('the charge beat holds the ambient medium and nothing the seal manifests', () => {
	// R-01: the charge beat is the portal tilt, and it is content — the medium
	// draws inward while the paper turns. R-02: nothing the seal manifests may
	// erupt until the tilt is over.
	assert.ok(landsOnStep(LATE_CHARGE_MS), `${LATE_CHARGE_MS}ms is not a whole simulation step`);
	for (const preset of LAB_PRESETS) {
		const cast = newPresetCast(preset);
		assert.ok(LATE_CHARGE_MS < cast.score.beats.charge.endMs, `${preset.id} charges past the tilt`);
		advanceCastTo(cast, LATE_CHARGE_MS);
		for (const of of ['medium', 'manifested'] as const) {
			const row: CastProbe = {
				...ask(
					preset.id,
					LATE_CHARGE_MS,
					of === 'medium' ? { metric: 'ink', above: 0 } : { metric: 'ink', below: 1e-9 }
				),
				of
			};
			const result = checkCastProbe(row, cast);
			assert.ok(result.passed, `${preset.id}: ${result.message}`);
		}
	}
});

test('stepping fresh to a timestamp matches stepping there incrementally', () => {
	// The contract that makes golden frames cheap: a baseline never depends on
	// which timestamps were sampled before it.
	const last = CAST_FRAME_MS[CAST_FRAME_MS.length - 1];
	for (const preset of LAB_PRESETS) {
		const incremental = newPresetCast(preset);
		for (const atMs of CAST_FRAME_MS) {
			advanceCastTo(incremental, atMs);
		}
		const fresh = newPresetCast(preset);
		advanceCastTo(fresh, last);
		assert.equal(incremental.clock.steps, fresh.clock.steps, `${preset.id} clock diverged`);
		assert.equal(frameText(incremental, last), frameText(fresh, last), `${preset.id} diverged`);
	}
});

test('two runs of the same cast reach the same state', () => {
	for (const preset of LAB_PRESETS) {
		assert.equal(
			renderPresetCast(preset),
			renderPresetCast(preset),
			`${preset.id} is not reproducible`
		);
	}
});

for (const preset of LAB_PRESETS) {
	test(`cast baseline: ${preset.id}`, () => {
		const path = join(CAST_DIR, castFileName(preset.id));
		assert.ok(existsSync(path), `no baseline for ${preset.id}: ${UPDATE_HINT}`);
		assert.equal(
			renderPresetCast(preset),
			readFileSync(path, 'utf8'),
			`${preset.id} differs from its baseline: ${UPDATE_HINT}`
		);
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
		const cast = newPresetCast(castSubjects().get(subject)!);
		const failures: string[] = [];
		for (const probe of rows) {
			advanceCastTo(cast, probe.atMs);
			const result = checkCastProbe(probe, cast);
			if (!result.passed) {
				failures.push(result.message);
			}
		}
		assert.equal(failures.length, 0, `\n${failures.join('\n')}`);
	});
}

test('a cast probe selector is R-10 vocabulary, and the two halves partition the world', () => {
	const cast = newPresetCast(castSubjects().get('pull-vortex')!);
	advanceCastTo(cast, 2600);
	const halves = (['medium', 'manifested'] as const).map(
		(of) => select({ ...ask('pull-vortex', 2600, { metric: 'ink' }), of }, cast).length
	);
	assert.equal(halves[0] + halves[1], cast.performers.length);
});
