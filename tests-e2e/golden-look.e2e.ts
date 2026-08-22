/**
 * Look golden tier: the Spell Effect Lab's effect canvas, for every lab preset,
 * at fixed timestamps on R-01's beat clock, plus two cases pinning the sigil look
 * rows. One engine, because since the redesign's phase 5 there is only one.
 *
 * Generate with `npm run test:golden:look:update`; a case whose baseline is
 * missing skips with a hint rather than failing.
 *
 * The cast tier (`npm run test:golden`) is the primary gate. This tier only
 * catches what pixels can say and motion cannot: colour, sprite, compositing.
 */

import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { LAB_PRESETS } from '../src/lib/ui/spellEffectLabPresets.js';

/**
 * Read off the beat clock rather than the wall. Charge ends at 980ms, the strike
 * runs to 1300ms, and the body of a 5s cast runs to 3820ms. 700ms is therefore
 * charge *content* — R-01's ambient medium drawing inward with the spell's own
 * manifestation still to come — then one frame inside the strike and one
 * mid-body.
 */
const FRAME_MS = [700, 1150, 2200] as const;

/** The two sigil rows keyed above their element (crystal over earth, aeroform over wind). */
const SIGIL_ROWS = ['crystal', 'aeroform'] as const;

/** The preset the sigil cases run, so their only difference from `column-balanced` is the row. */
const SIGIL_CASE_PRESET = 'column-balanced';

// The cast engine is seeded end to end and reads no clock, so its baselines are
// held tight; the tolerance only absorbs Chromium's gradient dithering.
const MAX_DIFF_PIXEL_RATIO = 0.005;

const UPDATE_HINT = 'run `npm run test:golden:look:update`';

/** One preset and one look row, at a list of timestamps. */
interface LookCase {
	/** Baseline file stem, distinct per case. */
	id: string;
	presetId: string;
	/** Omitted for the lab's default sigil. */
	sigil?: string;
	frames: readonly number[];
}

const LOOK_CASES: LookCase[] = [
	...LAB_PRESETS.map((preset) => ({
		id: `cast-${preset.id}`,
		presetId: preset.id,
		frames: FRAME_MS
	})),
	...SIGIL_ROWS.map((sigil) => ({
		id: `cast-${SIGIL_CASE_PRESET}-${sigil}`,
		presetId: SIGIL_CASE_PRESET,
		sigil,
		frames: FRAME_MS
	}))
];

function baselineName(caseId: string, atMs: number): string {
	return `${caseId}-${String(atMs).padStart(4, '0')}ms.png`;
}

// The route's scripted-clock hook: load this preset and step the preview to this
// timestamp, then stop. See lab-goldens.ts.
function labUrl(lookCase: LookCase, atMs: number): string {
	const params = new URLSearchParams({ preset: lookCase.presetId, frameMs: String(atMs) });
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
				maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO
			});
		});
	}
}
