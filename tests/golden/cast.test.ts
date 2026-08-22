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
import { newCast, simulateTo, stepTo } from '../../src/lib/cast/sim/cast.js';

const UPDATE_HINT = 'run `npm run test:golden:update` after reviewing the change';

/** The last whole simulation step still inside the 980ms charge beat. */
const LATE_CHARGE_MS = 975;

test('every cast frame timestamp lands on a whole simulation step', () => {
	for (const atMs of CAST_FRAME_MS) {
		assert.ok(landsOnStep(atMs), `${atMs}ms is not a whole simulation step`);
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

test('the charge beat is silent, so a cast never spawns before the portal has tilted', () => {
	// R-01: the charge beat is the portal tilt, and the paper always finishes
	// tilting before the spell erupts.
	assert.ok(landsOnStep(LATE_CHARGE_MS), `${LATE_CHARGE_MS}ms is not a whole simulation step`);
	for (const preset of FIELD_PRESETS) {
		const score = presetScore(preset);
		assert.ok(LATE_CHARGE_MS < score.beats.charge.endMs, `${preset.id} charges past the tilt`);
		assert.equal(
			simulateTo(score, LATE_CHARGE_MS).parcels.length,
			0,
			`${preset.id} emitted during charge`
		);
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
