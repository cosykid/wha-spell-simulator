import { expect, test } from '@playwright/test';
import { FIRE_SHOOT } from './fixtures/sampleSpells.js';
import { SpellCanvasPage } from './pages/SpellCanvasPage.js';

// This spec deliberately breaks the suite's "do not change the viewport" rule:
// the resize is the subject. It resizes only after every stroke is down, so no
// normalized draw coordinate is ever read against the resized canvas.
const RESIZED = { width: 954, height: 876 };

// How far apart the two centroids may sit and still read as concentric. The
// fixture's symbols are not evenly distributed, so even a correct ring leaves
// the two centroids ~13px apart. A ring stranded at the pre-resize canvas size
// displaces the guides by center * (1 - 954/1024), roughly 35px, so this sits
// clear of both.
const CONCENTRIC_TOLERANCE_PX = 22;
// The resize must not pull the guides off the ink at all; the small allowance
// only absorbs the ink centroid shifting as strokes are rescaled and re-inked.
const MAX_DRIFT_PX = 6;

/**
 * Centroids of the ink and of the teal guide layer, both read off the glyph
 * canvas. The seal guides are drawn from the recognized ring, so when the ring
 * is in the canvas's own coordinate space the two centroids sit on top of each
 * other. A ring left at a stale canvas size pulls the guide centroid away.
 */
async function centroids(page: import('@playwright/test').Page) {
	return page.evaluate(() => {
		const canvas = document.querySelector('[data-testid="glyph-canvas"]') as HTMLCanvasElement;
		const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
		const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
		let guideX = 0,
			guideY = 0,
			guideN = 0,
			inkX = 0,
			inkY = 0,
			inkN = 0;
		for (let y = 0; y < canvas.height; y += 1) {
			for (let x = 0; x < canvas.width; x += 1) {
				const i = (y * canvas.width + x) * 4;
				const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
				// Teal guide ink: green and blue clearly above red.
				if (a > 4 && g > r + 8 && b > r + 8) {
					guideX += x;
					guideY += y;
					guideN += 1;
				}
				// Drawn ink is near-black on light parchment.
				if (a > 60 && r < 90 && g < 90 && b < 90) {
					inkX += x;
					inkY += y;
					inkN += 1;
				}
			}
		}
		return {
			size: canvas.width,
			guide: guideN ? { x: guideX / guideN, y: guideY / guideN } : null,
			ink: inkN ? { x: inkX / inkN, y: inkY / inkN } : null
		};
	});
}

function offset(reading: Awaited<ReturnType<typeof centroids>>): number {
	expect(reading.guide, 'guide layer drew nothing').not.toBeNull();
	expect(reading.ink, 'no ink on the canvas').not.toBeNull();
	return Math.hypot(reading.guide!.x - reading.ink!.x, reading.guide!.y - reading.ink!.y);
}

test.describe('Canvas resize', () => {
	test('keeps the seal guides on the ink and never faults recognition', async ({ page }) => {
		const faults: string[] = [];
		page.on('pageerror', (error) => faults.push(error.message));

		const canvas = new SpellCanvasPage(page);
		await canvas.goto();
		await canvas.castSpell(FIRE_SHOOT, { skipSeal: true });
		await expect(canvas.statusValue).toHaveText('Prepared spell');

		const before = await centroids(page);
		expect(offset(before)).toBeLessThan(CONCENTRIC_TOLERANCE_PX);

		// Recognition is async and takes seconds on a full seal. The guides have to
		// follow the ink into the new canvas immediately, not once the recompute
		// lands, so read them back well inside that window.
		await page.setViewportSize(RESIZED);
		await page.waitForTimeout(600);

		const after = await centroids(page);
		expect(after.size).toBe(RESIZED.width);
		expect(after.size).not.toBe(before.size);
		expect(offset(after)).toBeLessThan(CONCENTRIC_TOLERANCE_PX);
		expect(offset(after) - offset(before)).toBeLessThan(MAX_DRIFT_PX);

		// The resize schedules a recompute straight into the window where the bound
		// canvas can read null. That used to throw out of the debounce timer.
		expect(faults).toEqual([]);
	});
});
