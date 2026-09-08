import { expect, test, type Page } from '@playwright/test';
import { SESSION_MARKER_COOKIE } from '../src/lib/auth/sessionMarker.js';
import {
	DB_SPECS_DISABLED,
	DB_SPECS_REASON,
	openMySpellsTab,
	registerViaMySpells,
	uniqueUsername
} from './helpers/account.js';
import { SpellCanvasPage } from './pages/SpellCanvasPage.js';

/**
 * Spelled out rather than imported: `SESSION_COOKIE` lives in `$lib/server`,
 * which SvelteKit refuses to let anything outside the server bundle reach.
 */
const SESSION_COOKIE_NAME = 'wha_session';

/** Every request the page makes to `/api/me`, in order. */
function watchForAccountRequests(page: Page): string[] {
	const asked: string[] = [];
	page.on('request', (request) => {
		if (new URL(request.url()).pathname === '/api/me') {
			asked.push(request.url());
		}
	});
	return asked;
}

/**
 * The sign-in prompt renders only once auth state has settled, so seeing it
 * means hydration is done and whatever request it meant to make has been made.
 */
async function waitForAuthSettled(page: Page): Promise<void> {
	await openMySpellsTab(page);
	await expect(page.getByTestId('my-spells-signin')).toBeVisible({ timeout: 15_000 });
}

/**
 * The prerendered shell cannot read the httpOnly session cookie, so it used to
 * ask `/api/me` on every load and be told `{ user: null }` by a function on the
 * far side of the Pacific. The marker cookie is what lets a guest skip that.
 *
 * No database needed: what is under test is which request the page decides to
 * make, and the marker is written by hand here.
 */
test.describe('the session marker', () => {
	test('a guest never asks the server who they are', async ({ page }) => {
		const asked = watchForAccountRequests(page);
		const canvas = new SpellCanvasPage(page);
		await canvas.goto();
		await waitForAuthSettled(page);

		expect(asked).toEqual([]);
	});

	/**
	 * The half a hand-written marker cannot reach: that the server issues and
	 * withdraws the marker with the session itself. Both cookies are written by
	 * one function and cleared by another, and this is what proves those two are
	 * the only ones that matter.
	 */
	test('is issued and withdrawn with the session itself', async ({ page, context }) => {
		test.skip(DB_SPECS_DISABLED, DB_SPECS_REASON);
		const canvas = new SpellCanvasPage(page);
		await canvas.goto();

		const marker = async () =>
			(await context.cookies()).find((cookie) => cookie.name === SESSION_MARKER_COOKIE);
		const session = async () =>
			(await context.cookies()).find((cookie) => cookie.name === SESSION_COOKIE_NAME);

		expect(await marker()).toBeUndefined();

		await registerViaMySpells(page, uniqueUsername());
		const issued = await marker();
		const token = await session();
		expect(issued).toBeDefined();
		expect(token).toBeDefined();
		// Readable by the page, unlike the token it stands for, and carrying
		// nothing that would identify its reader.
		expect(issued!.httpOnly).toBe(false);
		expect(token!.httpOnly).toBe(true);
		expect(issued!.value).toBe('1');
		// Same scope and same lifetime, or the browser could drop one and keep
		// the other.
		expect(issued!.path).toBe(token!.path);
		expect(issued!.sameSite).toBe(token!.sameSite);
		expect(issued!.expires).toBeCloseTo(token!.expires, 0);

		await page.getByTestId('my-spells-signout').click();
		await expect(page.getByTestId('my-spells-signin')).toBeVisible({ timeout: 15_000 });
		expect(await marker()).toBeUndefined();
		expect(await session()).toBeUndefined();
	});

	test('a browser carrying the marker does ask', async ({ page, context, baseURL }) => {
		await context.addCookies([
			{ name: SESSION_MARKER_COOKIE, value: '1', url: baseURL ?? 'http://localhost' }
		]);
		const asked = watchForAccountRequests(page);
		const canvas = new SpellCanvasPage(page);
		await canvas.goto();
		// The marker is a lie here, so the answer is still `{ user: null }` and the
		// prompt appears anyway. That the question was asked is the point.
		await waitForAuthSettled(page);

		expect(asked).toHaveLength(1);
	});
});
