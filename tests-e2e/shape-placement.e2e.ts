import { expect, test, type Locator } from '@playwright/test';
import { SpellCanvasPage } from './pages/SpellCanvasPage.js';

async function centerOf(locator: Locator): Promise<{ x: number; y: number }> {
	const box = await locator.boundingBox();
	if (!box) {
		throw new Error('Expected locator to be visible before calculating its center.');
	}
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe('Shape placement', () => {
	test('moves a dropped ring through Canvas API placement behavior', async ({ page }) => {
		const canvas = new SpellCanvasPage(page);
		await canvas.goto();

		await page.getByRole('button', { name: 'Shapes', exact: true }).click();
		const inspectorCard = page.locator('.shape-inspector-card');
		const ringPreview = page
			.locator('#shapesRootPanel .shape-card', { hasText: 'Spell Ring' })
			.locator('.reference-preview');

		const previewCenter = await centerOf(ringPreview);
		const canvasCenter = await centerOf(canvas.glyphCanvas);
		await page.mouse.move(previewCenter.x, previewCenter.y);
		await page.mouse.down();
		await page.mouse.move(canvasCenter.x, canvasCenter.y);
		await page.mouse.up();

		await expect(inspectorCard).toContainText('ring');
		await expect(canvas.undoButton).toBeEnabled();

		await page.mouse.move(canvasCenter.x, canvasCenter.y);
		await page.mouse.down();
		await page.mouse.move(canvasCenter.x + 90, canvasCenter.y + 40);
		await page.mouse.up();

		await canvas.undoButton.click();
		await expect(inspectorCard).toContainText('ring');

		await canvas.undoButton.click();
		await expect(inspectorCard).toBeHidden();
	});
});
