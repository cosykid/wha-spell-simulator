import { expect, test, type Request } from '@playwright/test';
import { SpellCanvasPage } from './pages/SpellCanvasPage.js';

/**
 * The recognizer's runtime is roughly 25 MB of weights and wasm, and it used to
 * load on mount, so every visitor who never drew still paid for it. These specs
 * pin the two rulings that took it off the page load: nothing fetches it before
 * the pen lands, and what it does fetch comes from the CDN under a versioned
 * model URL.
 *
 * Runs against the production build only. `vite dev` serves the wasm from
 * `/onnxruntime/` on purpose, so the CDN assertions below are meaningless there.
 */

const MODEL_DATA = /\/models\/glyph-recognizer\.onnx\.data/;
const CDN_WASM = /cdn\.jsdelivr\.net\/npm\/onnxruntime-web@[^/]+\/dist\/.*\.wasm$/;
const CDN_GLUE = /cdn\.jsdelivr\.net\/npm\/onnxruntime-web@[^/]+\/dist\/.*\.mjs$/;

/** The warning `loadRuntime` prints when the session never comes up. It fires
 * at `warn` level even with ML debug off, so a silent fallback to the template
 * recognizer still fails this spec instead of passing as a green run. */
const RUNTIME_FAILED = /unavailable; using template recognizer only/;

test.describe('ML asset loading', () => {
	test('defers the runtime to the first stroke, then loads it from the CDN', async ({ page }) => {
		const requests: Request[] = [];
		const warnings: string[] = [];
		page.on('request', (request) => requests.push(request));
		page.on('console', (message) => {
			if (message.type() === 'warning' || message.type() === 'error') {
				warnings.push(message.text());
			}
		});

		const canvas = new SpellCanvasPage(page);
		await canvas.goto();

		const urlsSoFar = () => requests.map((request) => request.url());

		// The page is up and drawable. Nothing may have reached for the runtime.
		expect(urlsSoFar().filter((url) => MODEL_DATA.test(url))).toEqual([]);
		expect(urlsSoFar().filter((url) => CDN_WASM.test(url))).toEqual([]);

		const modelResponse = page.waitForResponse(MODEL_DATA, { timeout: 90_000 });
		const wasmResponse = page.waitForResponse(CDN_WASM, { timeout: 90_000 });

		await canvas.drawStroke([
			{ x: 0.4, y: 0.4 },
			{ x: 0.6, y: 0.4 },
			{ x: 0.6, y: 0.6 },
			{ x: 0.4, y: 0.6 }
		]);

		// The pen landed, so both halves of the runtime are now on their way.
		expect((await wasmResponse).status()).toBe(200);
		const model = await modelResponse;
		expect(model.status()).toBe(200);

		// The versioned URL is what makes `immutable` on /models/ safe to serve.
		expect(new URL(model.url()).searchParams.get('v')).toMatch(/^[0-9a-f]{12}$/);

		const glue = urlsSoFar().filter((url) => CDN_GLUE.test(url));
		expect(glue.length).toBeGreaterThan(0);

		// The wasm and its glue must come from one pinned version, or ORT loads a
		// binary its loader does not match.
		const version = (url: string) => url.match(/onnxruntime-web@([^/]+)\//)?.[1];
		const wasmVersion = version((await wasmResponse).url());
		expect(glue.every((url) => version(url) === wasmVersion)).toBe(true);

		// Cross-origin glue on a cross-origin-isolated page is the fragile part of
		// serving ORT from a CDN: the session can fail while every fetch above
		// still returns 200. Give it room to build, then insist it came up.
		await page.waitForTimeout(15_000);
		expect(warnings.filter((text) => RUNTIME_FAILED.test(text))).toEqual([]);
	});
});
