/**
 * The exits out of a spent one-shot. A sealed canvas ignores freehand input
 * while its spell can still perform, but once the cast's own duration has run
 * out the page opens two ways forward: the next primary tap on the canvas
 * tears the page off, and the status note offers the same tear as a button.
 * Both are a clear rather than an unlock, so undo brings the spell back.
 */

import { expect, test } from '@playwright/test';
import { TOTAL_MS_RANGE } from '../src/lib/cast/score/beats.js';
import { FIRE_SHOOT } from './fixtures/sampleSpells.js';
import { DEFAULT_RING, SpellCanvasPage } from './pages/SpellCanvasPage.js';

/** The longest cast R-01 allows, plus slack for the timer that flips the note. */
const SPENT_DEADLINE_MS = TOTAL_MS_RANGE.max + 3000;

const FRESH_PAGE_TOAST = 'Fresh page - undo brings the spell back.';

/** Casts the reference spell and waits until its one-shot is spent. */
async function castUntilSpent(canvas: SpellCanvasPage) {
	await canvas.castSpell(FIRE_SHOOT);
	await canvas.expectActive();
	await expect(canvas.page.getByTestId('status-note')).toBeVisible({
		timeout: SPENT_DEADLINE_MS
	});
}

test.describe('Spent spell exits', () => {
	// Each test plays a whole cast and then waits out its duration.
	test.slow();

	test('a tap tears the spent page off and undo brings the spell back', async ({ page }) => {
		const canvas = new SpellCanvasPage(page);
		await canvas.goto();
		await castUntilSpent(canvas);

		// The cursor already says the paper takes the pen again.
		await expect.poll(() => canvas.glyphCanvas.evaluate((el) => el.style.cursor)).toBe('crosshair');

		await canvas.tapCanvas();

		// The tear is synchronous: status, note, and lock fall with the ink.
		await expect(canvas.statusValue).toHaveText('No ring detected');
		await expect(canvas.page.getByTestId('status-note')).toBeHidden();
		await expect(canvas.page.getByText(FRESH_PAGE_TOAST)).toBeVisible();

		// The very next stroke inks on the fresh page.
		await canvas.drawOpenRing(DEFAULT_RING);
		await expect(canvas.statusValue).toHaveText('Ring open - draw a sigil in the center');

		// One undo takes back the new ring, the next restores the torn-off spell.
		await canvas.undoButton.click();
		await expect(canvas.statusValue).toHaveText('No ring detected');
		await canvas.undoButton.click();
		await canvas.expectActive();
	});

	test('the status note starts a fresh page as a button', async ({ page }) => {
		const canvas = new SpellCanvasPage(page);
		await canvas.goto();
		await castUntilSpent(canvas);

		await canvas.page.getByTestId('fresh-page-button').click();

		await expect(canvas.statusValue).toHaveText('No ring detected');
		await expect(canvas.page.getByTestId('status-note')).toBeHidden();
		await expect(canvas.page.getByText(FRESH_PAGE_TOAST)).toBeVisible();

		// The button unlocks drawing just as the tap does.
		await canvas.drawOpenRing(DEFAULT_RING);
		await expect(canvas.statusValue).toHaveText('Ring open - draw a sigil in the center');
	});
});
