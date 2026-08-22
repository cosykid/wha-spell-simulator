/**
 * Look golden tier: the Spell Effect Lab's effect canvas, for every lab preset,
 * under both effect engines, at fixed timestamps.
 *
 * Two lists. The **field** list is the shipping renderer, sampled on the wall
 * clock. The **cast** list is the redesign's engine, sampled on R-01's beat
 * clock, plus two cases pinning the sigil look rows that phase 4 added.
 * Generate both in one command with `npm run test:golden:look:update`; a case
 * whose baseline is missing skips with a hint rather than failing.
 *
 * The motion tier (`npm run test:golden`) is the primary gate. This tier only
 * catches what pixels can say and motion cannot: colour, sprite, compositing.
 */

import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FIELD_PRESETS } from '../src/lib/ui/spellEffectLabPresets.js';
import type { LabEngine } from '../src/routes/tools/spell-effect-lab/lab-engines.js';

/**
 * Field frames: one during the 980ms portal tilt, one just after emission
 * starts, one with the effect developed. The lab's default cast runs 5s.
 */
const FIELD_FRAME_MS = [300, 1400, 2600] as const;

/**
 * Cast frames, read off the beat clock instead of the wall. Charge ends at
 * 980ms, the strike runs to 1300ms, and the body of a 5s cast runs to 3820ms.
 * 700ms is therefore charge *content* — R-01's ambient medium drawing inward
 * with the spell's own manifestation still to come — then one frame inside the
 * strike and one mid-body.
 */
const CAST_FRAME_MS = [700, 1150, 2200] as const;

/** The two sigil rows keyed above their element (crystal over earth, aeroform over wind). */
const SIGIL_ROWS = ['crystal', 'aeroform'] as const;

/** The preset the sigil cases run, so their only difference from `cast-column-balanced` is the row. */
const SIGIL_CASE_PRESET = 'column-balanced';

// The field effect jitters particles with Math.random and Chromium renders
// gradients a hair differently across machines, so a field baseline pins the
// composition rather than every pixel. The cast engine is seeded end to end and
// reads no clock, so its baselines are held far tighter.
const MAX_DIFF_PIXEL_RATIO = { field: 0.02, cast: 0.005 } as const;

const UPDATE_HINT = 'run `npm run test:golden:look:update`';

/** One preset, one engine, one look row, at a list of timestamps. */
interface LookCase {
	/** Baseline file stem, distinct per case. Field cases keep the bare preset id. */
	id: string;
	presetId: string;
	engine: LabEngine;
	/** Omitted for the lab's default sigil. */
	sigil?: string;
	frames: readonly number[];
}

const LOOK_CASES: LookCase[] = [
	...FIELD_PRESETS.map((preset) => ({
		id: preset.id,
		presetId: preset.id,
		engine: 'field' as const,
		frames: FIELD_FRAME_MS
	})),
	...FIELD_PRESETS.map((preset) => ({
		id: `cast-${preset.id}`,
		presetId: preset.id,
		engine: 'cast' as const,
		frames: CAST_FRAME_MS
	})),
	...SIGIL_ROWS.map((sigil) => ({
		id: `cast-${SIGIL_CASE_PRESET}-${sigil}`,
		presetId: SIGIL_CASE_PRESET,
		engine: 'cast' as const,
		sigil,
		frames: CAST_FRAME_MS
	}))
];

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

function baselineName(caseId: string, atMs: number): string {
	return `${caseId}-${String(atMs).padStart(4, '0')}ms.png`;
}

// The route's scripted-clock hook: load this preset under this engine and step
// the preview to this timestamp, then stop. See lab-goldens.ts.
function labUrl(lookCase: LookCase, atMs: number): string {
	const params = new URLSearchParams({
		preset: lookCase.presetId,
		frameMs: String(atMs),
		engine: lookCase.engine
	});
	if (lookCase.sigil) {
		params.set('sigil', lookCase.sigil);
	}
	return `/tools/spell-effect-lab?${params}`;
}

for (const lookCase of LOOK_CASES) {
	for (const atMs of lookCase.frames) {
		test(`look: ${lookCase.id} at ${atMs}ms`, async ({ page }, testInfo) => {
			const name = baselineName(lookCase.id, atMs);
			const updating = ['all', 'changed'].includes(testInfo.config.updateSnapshots);
			test.skip(
				!updating && !existsSync(testInfo.snapshotPath(name)),
				`no look baseline for ${name} yet: ${UPDATE_HINT}`
			);

			await page.goto(labUrl(lookCase, atMs));
			const effectCanvas = page.getByTestId('lab-effect-canvas');
			await expect(effectCanvas).toHaveAttribute('data-golden-frame', String(atMs));

			await expect(effectCanvas).toHaveScreenshot(name, {
				animations: 'disabled',
				maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO[lookCase.engine]
			});
		});
	}
}
