import { expect, type Page } from '@playwright/test';

/**
 * Database-backed specs are opt-in. They write accounts and spells, so they
 * must never run against a server whose DATABASE_URL_VPS points at the real
 * database. Start a disposable Postgres, point DATABASE_URL_VPS at it, and set
 * E2E_DB=1 to enable them.
 */
export const DB_SPECS_DISABLED = !process.env.E2E_DB;
export const DB_SPECS_REASON =
	'Set E2E_DB=1 with DATABASE_URL_VPS pointing at a disposable Postgres to run database specs.';

export function uniqueUsername(): string {
	return `e2e_${Date.now()}`;
}

/**
 * Opens the My Spells drawer tab. The open drawer slides over the tab rail, so
 * closing goes through Escape (see {@link closeDrawer}), not a second click.
 */
export async function openMySpellsTab(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'My Spells', exact: true }).click();
}

/** Closes whichever drawer is open via its Escape handler. */
export async function closeDrawer(page: Page): Promise<void> {
	await page.keyboard.press('Escape');
}

/**
 * Registers a fresh account through the auth dialog, entered from the My
 * Spells tab's sign-in prompt. Resolves once the drawer shows the signed-in
 * grimoire panel (the sign-in prompt disappears).
 */
export async function registerViaMySpells(
	page: Page,
	username: string,
	password = 'atelier-pass-1'
): Promise<void> {
	await openMySpellsTab(page);
	await page.getByTestId('my-spells-signin').click();
	await page.getByTestId('auth-switch-mode').click();
	await page.getByTestId('auth-username').fill(username);
	await page.getByTestId('auth-password').fill(password);
	await page.getByTestId('auth-submit').click();
	await expect(page.getByTestId('my-spells-signin')).toBeHidden({ timeout: 15_000 });
}

/**
 * Saves the current drawing under a name. The single save entry point is the
 * canvas action bar's Save spell button, which sits top-left and stays
 * clickable while the drawer is open.
 */
export async function saveCurrentSpell(page: Page, name: string): Promise<void> {
	await page.getByTestId('save-spell-button').click();
	await page.getByTestId('save-spell-name').fill(name);
	await page.getByTestId('save-spell-confirm').click();
	await expect(page.getByTestId('spell-card').filter({ hasText: name })).toBeVisible({
		timeout: 15_000
	});
}
