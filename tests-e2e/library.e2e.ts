import { expect, test } from '@playwright/test';
import { FIRE_SHOOT } from './fixtures/sampleSpells.js';
import {
	DB_SPECS_DISABLED,
	DB_SPECS_REASON,
	registerViaMySpells,
	saveCurrentSpell,
	uniqueUsername
} from './helpers/account.js';
import { SpellCanvasPage } from './pages/SpellCanvasPage.js';

test.describe('spell library', () => {
	test.skip(DB_SPECS_DISABLED, DB_SPECS_REASON);

	test('publishes a spell, then previews, upvotes, and casts it from the book', async ({
		page
	}) => {
		const canvas = new SpellCanvasPage(page);
		await canvas.goto();
		await canvas.castSpell(FIRE_SHOOT, { skipSeal: true });
		await expect(canvas.statusValue).toHaveText('Prepared spell', { timeout: 15_000 });

		const name = `Lib ${Date.now()}`;
		await registerViaMySpells(page, uniqueUsername());
		await saveCurrentSpell(page, name);

		// Publish it to the shared library from the drawer card.
		const drawerCard = page.getByTestId('spell-card').filter({ hasText: name });
		await drawerCard.getByTestId('spell-publish-toggle').click();
		await expect(drawerCard).toContainText('shared');

		// Browse the book. Newest sort puts the fresh spell on the first pages.
		await page.goto('/library');
		await expect(page.getByTestId('library-book')).toBeVisible();
		await page.getByTestId('library-sort-new').click();
		const card = page.getByTestId('library-spell-card').filter({ hasText: name }).first();
		await expect(card).toBeVisible({ timeout: 15_000 });

		// A valid spell offers an animated preview without manual triggering.
		await card.getByTestId('spell-preview-toggle').click();
		await expect(card.getByTestId('spell-preview-stage')).toBeVisible();

		await card.getByTestId('spell-upvote-button').click();
		await expect(card.getByTestId('spell-upvote-button')).toHaveText(/^1$/);

		// Cast hands the spell to the simulator, restored prepared.
		await card.getByTestId('spell-cast-button').click();
		await canvas.waitForReady();
		await expect(canvas.statusValue).toHaveText('Prepared spell', { timeout: 20_000 });
	});

	test('guests can browse but are asked to sign in before voting', async ({ page }) => {
		await page.goto('/library');
		await expect(page.getByTestId('library-book')).toBeVisible();
		const vote = page.getByTestId('spell-upvote-button').first();
		test.skip((await vote.count()) === 0, 'No published spells to vote on.');
		await vote.click();
		await expect(page.getByTestId('auth-dialog')).toBeVisible();
	});
});
