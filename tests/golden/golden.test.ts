import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BASELINE_DIR, FIELD_PRESETS, FRAME_MS, renderPresetFrames } from './frames.js';
import { MOTION, simulateTo, spawnPopulation, stepTo, stepsFor } from './motion.js';
import { checkProbe, type Probe } from './probeMetrics.js';
import { PROBES } from './probes.js';

const UPDATE_HINT = 'run `npm run test:golden:update` after reviewing the change';

test('every frame timestamp lands on a whole simulation step', () => {
	for (const atMs of FRAME_MS) {
		assert.equal(
			stepsFor(atMs) * MOTION.stepMs,
			atMs,
			`${atMs}ms is not a multiple of the ${MOTION.stepMs}ms step`
		);
	}
});

test('every probe row names a real preset', () => {
	for (const probe of PROBES) {
		assert.ok(
			FIELD_PRESETS.some((preset) => preset.id === probe.presetId),
			`probe [${probe.rulingId}] names "${probe.presetId}", which is not a lab preset`
		);
	}
});

test('stepping fresh to a timestamp matches stepping there incrementally', () => {
	// The contract that makes golden frames cheap: a baseline never depends on
	// which timestamps were sampled before it.
	for (const preset of FIELD_PRESETS) {
		const incremental = spawnPopulation(preset.id, preset.signs);
		for (const atMs of FRAME_MS) {
			stepTo(incremental, atMs);
		}
		const fresh = simulateTo(preset.id, preset.signs, FRAME_MS[FRAME_MS.length - 1]);
		assert.deepEqual(incremental.parcels, fresh.parcels, `${preset.id} diverged`);
	}
});

for (const preset of FIELD_PRESETS) {
	test(`motion baseline: ${preset.id}`, () => {
		for (const frame of renderPresetFrames(preset)) {
			const path = join(BASELINE_DIR, frame.fileName);
			assert.ok(existsSync(path), `no baseline ${frame.fileName}: ${UPDATE_HINT}`);
			assert.ok(
				readFileSync(path).equals(frame.png),
				`${frame.fileName} differs from its baseline: ${UPDATE_HINT}`
			);
		}
	});
}

/** Probes on one preset, cheapest to run against one population stepped in order. */
function probesByPreset(): Map<string, Probe[]> {
	const grouped = new Map<string, Probe[]>();
	for (const probe of PROBES) {
		const rows = grouped.get(probe.presetId) ?? [];
		rows.push(probe);
		grouped.set(probe.presetId, rows);
	}
	for (const rows of grouped.values()) {
		rows.sort((a, b) => a.atMs - b.atMs);
	}
	return grouped;
}

for (const [presetId, rows] of probesByPreset()) {
	test(`probes: ${presetId}`, () => {
		const preset = FIELD_PRESETS.find((candidate) => candidate.id === presetId)!;
		const population = spawnPopulation(preset.id, preset.signs);
		const failures: string[] = [];
		for (const probe of rows) {
			stepTo(population, probe.atMs);
			const result = checkProbe(probe, population);
			if (!result.passed) {
				failures.push(result.message);
			}
		}
		assert.equal(failures.length, 0, `\n${failures.join('\n')}`);
	});
}
