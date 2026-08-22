/**
 * Look golden tier: the Spell Effect Lab's effect canvas, for every field
 * preset, at fixed timestamps.
 *
 * Baselines are deliberately absent. The portal projection is being unified, so
 * a baseline taken now would be stale on arrival; until it lands every case
 * skips with a hint. Generate them in one command with
 * `npm run test:golden:look:update`.
 *
 * The motion tier (`npm run test:golden`) is the primary gate. This tier only
 * catches what pixels can say and motion cannot: colour, sprite, compositing.
 */

import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FIELD_PRESETS } from '../src/lib/ui/spellEffectLabPresets.js';

/**
 * One frame during the 980ms portal tilt, one just after emission starts, and
 * one with the effect developed. The lab's default cast runs 5s.
 */
const FRAME_MS = [300, 1400, 2600];

// Chromium renders text and gradients a hair differently across machines, so a
// look baseline pins the composition, not every pixel.
const MAX_DIFF_PIXEL_RATIO = 0.02;

const UPDATE_HINT = 'run `npm run test:golden:look:update`';

// The field effect spawns and jitters particles with Math.random, so an
// unseeded page paints a different frame every run. Seeding it in the page is
// the test's job; the app keeps its real randomness.
function installSeededRandom(): void {
	let state = 0x9e3779b9;
	Math.random = () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

test.beforeEach(async ({ page }) => {
	await page.addInitScript(installSeededRandom);
});

function baselineName(presetId: string, atMs: number): string {
	return `${presetId}-${String(atMs).padStart(4, '0')}ms.png`;
}

for (const preset of FIELD_PRESETS) {
	for (const atMs of FRAME_MS) {
		test(`look: ${preset.id} at ${atMs}ms`, async ({ page }, testInfo) => {
			const name = baselineName(preset.id, atMs);
			const updating = ['all', 'changed'].includes(testInfo.config.updateSnapshots);
			test.skip(
				!updating && !existsSync(testInfo.snapshotPath(name)),
				`no look baseline for ${name} yet (held back until the portal projection lands): ${UPDATE_HINT}`
			);

			// The route's scripted-clock hook: load this preset and step the preview
			// to this timestamp, then stop. See lab-goldens.ts.
			await page.goto(`/tools/spell-effect-lab?preset=${preset.id}&frameMs=${atMs}`);
			const effectCanvas = page.getByTestId('lab-effect-canvas');
			await expect(effectCanvas).toHaveAttribute('data-golden-frame', String(atMs));

			await expect(effectCanvas).toHaveScreenshot(name, {
				animations: 'disabled',
				maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO
			});
		});
	}
}
