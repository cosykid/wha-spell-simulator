/**
 * The exits out of a spent one-shot. A sealed canvas ignores freehand input
 * while its spell can still perform, but once the cast's own duration has run
 * out the page opens: the next primary tap on the canvas tears it off, and the
 * status note offers that tear as a button beside a second way forward, which
 * takes the sealing stroke back and leaves the rest of the diagram to edit.
 * None of them unlocks a closed ring, so undo brings the spell back.
 *
 * Both ways back to an active spell are a second performance of one drawing, so
 * both assert the cast actually paints: they are the regression cover for a
 * stage that keyed its running cast on the spell rather than on the performance
 * and handed the replay a clock that had already run out.
 */

import { expect, test } from '@playwright/test';
import { TOTAL_MS_RANGE } from '../src/lib/cast/score/beats.js';
import { FIRE_SHOOT } from './fixtures/sampleSpells.js';
import { DEFAULT_RING, SpellCanvasPage } from './pages/SpellCanvasPage.js';

/** The longest cast R-01 allows, plus slack for the timer that flips the note. */
const SPENT_DEADLINE_MS = TOTAL_MS_RANGE.max + 3000;

/** How long a recompute over a full seal may take to settle the status. */
const RECOGNITION_TIMEOUT_MS = 15_000;

const FRESH_PAGE_TOAST = 'Fresh page. Undo to restore the spell.';
const REOPEN_TOAST = 'Ring reopened. Seal it to cast again.';

/** Casts the reference spell and waits until its one-shot is spent. */
async function castUntilSpent(canvas: SpellCanvasPage) {
	await canvas.castSpell(FIRE_SHOOT);
	await canvas.expectActive();
	await expect(canvas.statusNote).toBeVisible({ timeout: SPENT_DEADLINE_MS });
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
		await expect(canvas.statusNote).toBeHidden();
		await expect(canvas.page.getByText(FRESH_PAGE_TOAST)).toBeVisible();

		// The very next stroke inks on the fresh page, once the paper is back down.
		await canvas.waitForPaperSettled();
		await canvas.drawOpenRing(DEFAULT_RING);
		await expect(canvas.statusValue).toHaveText('Ring open - draw a sigil in the center');

		// One undo takes back the new ring, the next restores the torn-off spell.
		await canvas.undoButton.click();
		await expect(canvas.statusValue).toHaveText('No ring detected');
		await canvas.undoButton.click();
		await canvas.expectActive();

		// The restored spell is a second performance of one drawing, so it plays
		// rather than inheriting the finished cast's spent clock.
		await canvas.waitForCastInk();
	});

	test('the status note starts a fresh page as a button', async ({ page }) => {
		const canvas = new SpellCanvasPage(page);
		await canvas.goto();
		await castUntilSpent(canvas);

		await canvas.freshPageButton.click();

		await expect(canvas.statusValue).toHaveText('No ring detected');
		await expect(canvas.statusNote).toBeHidden();
		await expect(canvas.page.getByText(FRESH_PAGE_TOAST)).toBeVisible();

		// The button unlocks drawing just as the tap does.
		await canvas.waitForPaperSettled();
		await canvas.drawOpenRing(DEFAULT_RING);
		await expect(canvas.statusValue).toHaveText('Ring open - draw a sigil in the center');
	});

	test('the status note reopens the ring and keeps the diagram', async ({ page }) => {
		const canvas = new SpellCanvasPage(page);
		await canvas.goto();
		await castUntilSpent(canvas);

		await canvas.reopenRingButton.click();

		// The spell falls in the same tick the sealing stroke does, and the
		// recompute then reads what is left as the draft it was before it cast.
		await expect(canvas.statusNote).toBeHidden();
		await expect(canvas.page.getByText(REOPEN_TOAST)).toBeVisible();
		await expect(canvas.statusValue).toHaveText('Prepared spell', {
			timeout: RECOGNITION_TIMEOUT_MS
		});

		// The rest of the diagram survived, so closing the gap casts it again, and
		// the second performance of the same drawing plays like the first.
		await canvas.waitForPaperSettled();
		await canvas.sealRing(DEFAULT_RING);
		await canvas.expectActive();
		await canvas.waitForCastInk();
	});
});
