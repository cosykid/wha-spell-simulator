import { expect, test, type Page } from '@playwright/test';
import { SESSION_MARKER_COOKIE } from '../src/lib/auth/sessionMarker.js';
import { openMySpellsTab } from './helpers/account.js';
import { SpellCanvasPage } from './pages/SpellCanvasPage.js';

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
