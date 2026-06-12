import { expect, test } from '@playwright/test';
import { SpellCanvasPage } from './pages/SpellCanvasPage.js';

// Ink is opaque (#241b16, r≈36); the parchment background is also opaque but
// light (r≈235). We detect ink by its darkness: (255 - minRed) in a 10x10 box.
// Ink → darkness ≈ 213; parchment only → darkness ≈ 20. A threshold of 150
// cleanly separates the two, matching the INK_ALPHA name kept from the spec.
const INK_ALPHA = 150;

/** Max alpha in a 10x10 box around a normalized canvas coordinate. */
async function maxAlphaAt(page: import('@playwright/test').Page, nx: number, ny: number) {
	return page.evaluate(
		([x, y]) => {
			const canvas = document.querySelector('[data-testid="glyph-canvas"]') as HTMLCanvasElement;
			const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
			const px = Math.round(x * canvas.width);
			const py = Math.round(y * canvas.height);
			const data = ctx.getImageData(px - 5, py - 5, 10, 10).data;
			// The canvas background is opaque parchment (alpha 255 everywhere); use
			// ink darkness (255 - minRed) as the signal instead of the alpha channel.
			let minRed = 255;
			for (let i = 0; i < data.length; i += 4) {
				if (data[i] < minRed) minRed = data[i];
			}
			return 255 - minRed;
		},
		[nx, ny]
	);
}

test.describe('Eraser tool', () => {
	test('erases ink under the brush, splits the stroke, and undo restores it', async ({ page }) => {
		const canvas = new SpellCanvasPage(page);
		await canvas.goto();

		// A horizontal line through the canvas center.
		const line = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8].map((x) => ({ x, y: 0.5 }));
		await canvas.drawStroke(line);
		expect(await maxAlphaAt(page, 0.5, 0.5)).toBeGreaterThan(INK_ALPHA);

		const eraserToggle = page.getByTestId('eraser-toggle');
		await eraserToggle.click();
		await expect(eraserToggle).toHaveAttribute('aria-pressed', 'true');

		// Swipe vertically through the line's middle. drawStroke drives the same
		// pointer gestures whether drawing or erasing.
		const swipe = [0.35, 0.42, 0.5, 0.58, 0.65].map((y) => ({ x: 0.5, y }));
		await canvas.drawStroke(swipe);

		// The middle is gone but the left remnant survives (partial erase).
		expect(await maxAlphaAt(page, 0.5, 0.5)).toBeLessThan(INK_ALPHA);
		expect(await maxAlphaAt(page, 0.3, 0.5)).toBeGreaterThan(INK_ALPHA);

		// One eraser gesture is one undo step.
		await canvas.undoButton.click();
		await page.waitForTimeout(150);
		expect(await maxAlphaAt(page, 0.5, 0.5)).toBeGreaterThan(INK_ALPHA);
	});
});
