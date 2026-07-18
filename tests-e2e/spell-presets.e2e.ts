import { expect, test } from '@playwright/test';
import { FIRE_SHOOT } from './fixtures/sampleSpells.js';
import {
	closeDrawer,
	DB_SPECS_DISABLED,
	DB_SPECS_REASON,
	registerViaMySpells,
	saveCurrentSpell,
	uniqueUsername
} from './helpers/account.js';
import { DEFAULT_RING, SpellCanvasPage } from './pages/SpellCanvasPage.js';

test.describe('spell presets', () => {
	test.skip(DB_SPECS_DISABLED, DB_SPECS_REASON);

	test('saves a prepared spell, reloads it, and seals it by hand', async ({ page }) => {
		const canvas = new SpellCanvasPage(page);
		await canvas.goto();

		// Draw the full diagram but leave the ring open, the state presets store.
		await canvas.castSpell(FIRE_SHOOT, { skipSeal: true });
		await expect(canvas.statusValue).toHaveText('Prepared spell', { timeout: 15_000 });

		await registerViaMySpells(page, uniqueUsername());
		await saveCurrentSpell(page, 'Fire Shoot Preset');

		// Wipe the canvas, then recall the preset from the drawer list.
		await canvas.clearButton.click();
		await expect(canvas.statusValue).toHaveText('No ring detected', { timeout: 15_000 });
		await page.getByTestId('spell-load-button').first().click();

		// The restored spell must come back unsealed: prepared, never active.
		await expect(canvas.statusValue).toHaveText('Prepared spell', { timeout: 15_000 });

		// Close the drawer, then seal the restored ring to activate the spell.
		await closeDrawer(page);
		await canvas.sealRing(DEFAULT_RING);
		await canvas.expectActive();
	});
});
