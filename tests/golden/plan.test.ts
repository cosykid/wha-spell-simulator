/**
 * @file The plan golden tier: every lab preset's resolved `SpellPlan`, as text.
 *
 * The comparison is on the file's exact contents, the same way the motion tier
 * compares PNG bytes; strings rather than buffers only so a failure prints a
 * readable diff of the ruling that moved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { LAB_PRESETS, PLAN_DIR, planFileName, renderPresetPlan } from './plans.js';

const UPDATE_HINT = 'run `npm run test:golden:update` after reviewing the change';

test('every committed plan baseline names a real preset', () => {
	const expected = new Set(LAB_PRESETS.map((preset) => planFileName(preset.id)));
	for (const name of readdirSync(PLAN_DIR).filter((file) => file.endsWith('.txt'))) {
		assert.ok(expected.has(name), `plan baseline "${name}" has no lab preset: ${UPDATE_HINT}`);
	}
});

for (const preset of LAB_PRESETS) {
	test(`plan baseline: ${preset.id}`, () => {
		const path = join(PLAN_DIR, planFileName(preset.id));
		assert.ok(existsSync(path), `no plan baseline for ${preset.id}: ${UPDATE_HINT}`);
		assert.equal(
			renderPresetPlan(preset),
			readFileSync(path, 'utf8'),
			`${preset.id} differs from its plan baseline: ${UPDATE_HINT}`
		);
	});
}
