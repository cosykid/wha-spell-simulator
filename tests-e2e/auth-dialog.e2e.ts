import { expect, test } from '@playwright/test';
import { openMySpellsTab } from './helpers/account.js';
import { SpellCanvasPage } from './pages/SpellCanvasPage.js';

/**
 * The sign-in prompt interrupts whatever the reader was doing, so every way out
 * of it has to keep working. It once had none at all: no close control, and a
 * backdrop that swallowed the clicks aimed at it.
 */
test.describe('sign-in dialog', () => {
	test('is dismissible by its close button, the backdrop, and Escape', async ({ page }) => {
		const canvas = new SpellCanvasPage(page);
		await canvas.goto();

		const dialog = page.getByTestId('auth-dialog');
		async function openPrompt() {
			await page.getByTestId('my-spells-signin').click();
			await expect(dialog).toBeVisible();
		}

		await openMySpellsTab(page);
		await openPrompt();

		// The close control in the card's corner.
		await page.getByTestId('auth-close').click();
		await expect(dialog).toBeHidden();

		// The card itself holds its ground, including its bare padding, which
		// reports the dialog as the click's target the same way the backdrop does.
		await openPrompt();
		const box = await dialog.boundingBox();
		expect(box).not.toBeNull();
		await page.mouse.click(box!.x + 8, box!.y + 8);
		await expect(dialog).toBeVisible();

		// The dim area around it dismisses, the way the drawers' backdrop does.
		await page.mouse.click(20, 20);
		await expect(dialog).toBeHidden();

		// Escape, the same key that closes every other modal here.
		await openPrompt();
		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();

		// Dismissing is not a one-time exit: the prompt still opens afterwards.
		await openPrompt();
	});
});
