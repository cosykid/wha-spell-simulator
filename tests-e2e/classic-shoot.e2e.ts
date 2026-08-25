/**
 * The same reference cast under the classic style: draw, seal, activate, then
 * read the effect canvas back through the Canvas2D probe.
 *
 * It is a separate spec rather than a parameterized run of `fire-shoot.e2e.ts`
 * because the two styles do not agree about the portal tilt. The stage makes it
 * R-01's charge beat and paints the ambient medium through it; classic holds
 * *all* emission back until it is over. `fire-shoot`'s first assertion —
 * "the ambient medium draws in during the portal tilt" — inverts here, and a
 * shared spec would have to say nothing about either.
 *
 * The claims are classic's own: silent through the tilt, lit through the body,
 * empty at the end, and reachable from the UI.
 */

import { expect, test } from '@playwright/test';
import { DEFAULT_RING, SpellCanvasPage } from './pages/SpellCanvasPage.js';
import { FIRE_SHOOT } from './fixtures/sampleSpells.js';
import { PORTAL } from '../src/lib/portal/portal.js';
import { TOTAL_MS_RANGE } from '../src/lib/cast/score/beats.js';

/** Inside the portal tilt, which classic emits nothing during. */
const TILT_AT_MS = 600;

/** Past the tilt, with the effect developed. */
const BODY_AT_MS = 1800;

/** Past the longest cast either style allows, plus the tilt classic waits out. */
const CAST_DEADLINE_MS = TOTAL_MS_RANGE.max + PORTAL.tiltMs + 1000;

/** Coarse: this is a wiring gate, not a look. */
const MIN_BODY_COVERAGE = 0.002;

/** Seeds the caster's stored style, the way `shape-placement` seeds arrange mode. */
async function preferClassic(page: import('@playwright/test').Page): Promise<void> {
	await page.addInitScript(() => {
		localStorage.setItem(
			'wha-spell-simulator:toggle-preferences',
			JSON.stringify({
				showGuides: true,
				showDiagnostics: false,
				arrangeShapes: false,
				effectStyle: 'classic'
			})
		);
	});
}

test.describe('Classic effect style', () => {
	// A whole cast played out and then waited to the end, on top of thirteen
	// strokes through real pointer input.
	test.slow();

	test('holds every particle back through the portal tilt, then fills and clears', async ({
		page
	}) => {
		await preferClassic(page);

		const canvas = new SpellCanvasPage(page);
		await canvas.goto();
		await expect(canvas.effectCanvas).toHaveAttribute('data-effect-style', 'classic');

		await canvas.castSpell(FIRE_SHOOT, { skipSeal: true });
		await expect(canvas.statusValue).toHaveText('Prepared spell');

		await canvas.armCastClock();
		await canvas.sealRing(DEFAULT_RING, undefined, { settleMs: 0 });
		await canvas.expectActive();
		await expect(canvas.elementValue).toHaveText('fire');

		// One pass, so the round trip between samples cannot step the cast past the
		// moment emission opens.
		const [tilt, body] = await canvas.sampleCast([TILT_AT_MS, BODY_AT_MS]);

		expect(tilt.takenAtMs, 'the tilt sample landed inside the tilt').toBeLessThan(PORTAL.tiltMs);
		expect(tilt.coverage, 'classic paints nothing until the paper has finished tilting').toBe(0);
		expect(body.coverage, 'the spell fills the portal once emission opens').toBeGreaterThan(
			MIN_BODY_COVERAGE
		);

		const endedAtMs = await canvas.waitForCastEnd(CAST_DEADLINE_MS);
		expect(endedAtMs, 'a classic cast is a one-shot and clears itself').toBeLessThan(
			CAST_DEADLINE_MS
		);
	});

	test('the toggle swaps engines mid-cast and both of them paint', async ({ page }) => {
		const canvas = new SpellCanvasPage(page);
		await canvas.goto();
		await expect(canvas.effectCanvas).toHaveAttribute('data-effect-style', 'stage');

		await canvas.castSpell(FIRE_SHOOT, { skipSeal: true });
		await canvas.armCastClock();
		await canvas.sealRing(DEFAULT_RING, undefined, { settleMs: 0 });
		await canvas.expectActive();

		// The stage lights its ambient medium the moment the clock starts, so this
		// resolves inside the charge and leaves classic's whole body to arrive in.
		await canvas.waitForCastInk();
		expect(await canvas.readCastInk(), 'the stage is painting').toBeGreaterThan(0);

		await canvas.effectStyleToggle.click();
		await expect(canvas.effectCanvas).toHaveAttribute('data-effect-style', 'classic');

		// The proof that the swap gave classic a canvas it could actually take: a
		// canvas that ever handed out a WebGL context can never return a `2d` one,
		// and the failure would be silent.
		await canvas.waitForCastInk();
		expect(await canvas.readCastInk(), 'classic is painting the same cast').toBeGreaterThan(0);

		// The trip back is asserted in the next test, where no probe is armed: the
		// reader binds a context on first read, and a probe that got to a fresh
		// stage canvas before the stage did would fix its attributes for it.
	});

	test('the chosen style survives a reload, and switches back', async ({ page }) => {
		const canvas = new SpellCanvasPage(page);
		await canvas.goto();
		await expect(canvas.effectStyleToggle).toHaveAttribute('aria-pressed', 'false');

		await canvas.effectStyleToggle.click();
		await expect(canvas.effectCanvas).toHaveAttribute('data-effect-style', 'classic');

		await canvas.goto();
		await expect(canvas.effectCanvas).toHaveAttribute('data-effect-style', 'classic');
		await expect(canvas.effectStyleToggle).toHaveAttribute('aria-pressed', 'true');

		await canvas.effectStyleToggle.click();
		await expect(canvas.effectCanvas).toHaveAttribute('data-effect-style', 'stage');
	});
});
