/**
 * The first-spell guide, from the newcomer's side: the welcome card that opens
 * itself once per device, the walk whose captions follow the paper rather than a
 * cursor of their own, and the celebration the finished cast hands over to.
 *
 * The walk is only trustworthy if its steps read off real recognition, so the
 * spec drives it with the page object's own primitives — the same strokes any
 * other spec casts with — and asserts the caption's `data-guide-step` moved. The
 * words themselves are the unit suite's job.
 */

import { expect, test, type Page } from '@playwright/test';
import { FIRE_SHOOT } from './fixtures/sampleSpells.js';
import { DEFAULT_RING, SpellCanvasPage } from './pages/SpellCanvasPage.js';

/**
 * A caption advance waits on a settled reading, so the ML refinement pass gates
 * it the same way it gates an activation.
 */
const STEP_TIMEOUT_MS = 15_000;
/**
 * Coaching speaks only for a settled reading, and a sealed ring with nothing
 * usable inside it is the slowest read there is: the template verdict lands
 * quickly and then the whole ML pass has to agree before a word is said.
 */
const COACHING_TIMEOUT_MS = 25_000;
/** The sealed one-shot plays itself out before the celebration takes over. */
const CELEBRATION_TIMEOUT_MS = 20_000;
/**
 * The auto-offer lands in the same flush as `data-input-ready`, so a spec that
 * claims the card is absent has to outlast the flush that would have brought it.
 */
const OFFER_SETTLE_MS = 1000;

/** The guide's own chrome. Every canvas gesture still goes through the page object. */
function guideChrome(page: Page) {
	return {
		dialog: page.getByTestId('first-spell-dialog'),
		begin: page.getByTestId('guide-begin-button'),
		dismiss: page.getByTestId('guide-dismiss-button'),
		finish: page.getByTestId('guide-finish-button'),
		caption: page.getByTestId('first-spell-caption'),
		coaching: page.getByTestId('guide-coaching'),
		practice: page.getByTestId('guide-practice-button')
	};
}

test.describe('first-spell guide', () => {
	test('offers itself once, and the menu calls it back', async ({ page }) => {
		const canvas = new SpellCanvasPage(page);
		await canvas.goto({ firstSpellSeen: false });

		const guide = guideChrome(page);
		await expect(guide.dialog).toBeVisible();

		await guide.dismiss.click();
		await expect(guide.dialog).toBeHidden();

		// Answering the offer is what marks it answered, and the mark outlives the
		// page: a reader who declined does not get asked again on the next visit.
		await page.reload();
		await canvas.waitForReady();
		await page.waitForTimeout(OFFER_SETTLE_MS);
		await expect(guide.dialog).toBeHidden();

		// Declining is not a one-time exit. The menu is the way back in.
		await page.getByRole('button', { name: 'Menu', exact: true }).click();
		await page.getByTestId('menu-first-spell-guide').click();
		await expect(guide.begin).toBeVisible();
	});

	test('stays out of the way of a returning reader', async ({ page }) => {
		const canvas = new SpellCanvasPage(page);
		// The default `goto` pre-seeds the seen flag, which is what keeps the modal
		// from swallowing the pointer gestures of every other spec in the suite.
		await canvas.goto();

		const guide = guideChrome(page);
		await page.waitForTimeout(OFFER_SETTLE_MS);
		await expect(guide.dialog).toBeHidden();
		await expect(guide.caption).toHaveCount(0);
		await expect(canvas.canvasHint).toBeVisible();
	});

	test('walks a first cast from empty paper to celebration', async ({ page }) => {
		// A whole cast played out, on top of thirteen strokes of real pointer input.
		test.slow();

		const canvas = new SpellCanvasPage(page);
		await canvas.goto({ firstSpellSeen: false });

		const guide = guideChrome(page);
		await expect(guide.dialog).toBeVisible();
		await guide.begin.click();
		await expect(guide.dialog).toBeHidden();
		await expect(guide.caption).toHaveAttribute('data-guide-step', 'ring');

		// Step 1: the open ring. The guide reads whatever ring the drawer made, so
		// the page object's own geometry is what it has to follow.
		await canvas.drawOpenRing(DEFAULT_RING);
		await expect(canvas.statusValue).toHaveText('Ring open - draw a sigil in the center', {
			timeout: STEP_TIMEOUT_MS
		});
		await expect(guide.caption).toHaveAttribute('data-guide-step', 'sigil');

		// Step 2: the sigil that names the spell. The advance waits for the ML pass
		// to settle, which is why it gets an activation-sized timeout.
		await canvas.drawStrokes(FIRE_SHOOT.symbols);
		await expect(guide.caption).toHaveAttribute('data-guide-step', 'seal', {
			timeout: STEP_TIMEOUT_MS
		});

		// Step 3: sealing is the cast, so there is no cast button to point at.
		await canvas.sealRing(DEFAULT_RING);
		await canvas.expectActive();
		await expect(canvas.elementValue).toHaveText('fire');
		await expect(guide.caption).toHaveAttribute('data-guide-step', 'cast');

		// The walk ends itself: the spent one-shot hands over to the celebration.
		await expect(guide.finish).toBeVisible({ timeout: CELEBRATION_TIMEOUT_MS });
		await guide.finish.click();
		await expect(guide.dialog).toBeHidden();
		await expect(guide.caption).toHaveCount(0);
	});

	test('places the practice spell for a drawer who asks', async ({ page }) => {
		const canvas = new SpellCanvasPage(page);
		await canvas.goto({ firstSpellSeen: false });

		const guide = guideChrome(page);
		await guide.begin.click();
		await expect(guide.caption).toHaveAttribute('data-guide-step', 'ring');

		// The offer lands the ring and the fire sigil as real ink, so the walk skips
		// to the one stroke it cannot draw for you.
		await guide.practice.click();
		await expect(canvas.statusValue).toHaveText('Prepared spell', { timeout: STEP_TIMEOUT_MS });
		await expect(canvas.elementValue).toHaveText('fire');
		await expect(guide.caption).toHaveAttribute('data-guide-step', 'seal');
	});

	test('coaches a ring that was sealed too soon', async ({ page }) => {
		// Two full-canvas strokes and then a wait on the slowest reading the pipeline
		// produces, which together outrun the default budget on a loaded machine.
		test.slow();

		const canvas = new SpellCanvasPage(page);
		await canvas.goto({ firstSpellSeen: false });

		const guide = guideChrome(page);
		await guide.begin.click();
		await expect(guide.caption).toHaveAttribute('data-guide-step', 'ring');

		// Closing the circle with nothing inside it locks the canvas on a spell that
		// can never wake, and no path unlocks a closed ring — so the coaching has to
		// name the undo that is the only way out.
		await canvas.drawOpenRing(DEFAULT_RING);
		await canvas.sealRing(DEFAULT_RING);
		await expect(guide.coaching).toContainText('Undo', { timeout: COACHING_TIMEOUT_MS });
	});
});
