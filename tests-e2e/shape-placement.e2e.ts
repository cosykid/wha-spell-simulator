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

	// Regression: a persisted `arrange` preference applies the mode during
	// `loadPreferences` without going through `setCanvasMode`. The placement
	// behavior used to miss that and stay disabled, so a dropped shape could not be
	// moved, reselected, or deselected.
	test('keeps placements interactive when arrange mode is restored from preferences', async ({
		page
	}) => {
		await page.addInitScript(() => {
			localStorage.setItem(
				'wha-spell-simulator:toggle-preferences',
				JSON.stringify({ showGuides: true, showDiagnostics: false, arrangeShapes: true })
			);
		});

		const canvas = new SpellCanvasPage(page);
		await canvas.goto();
		await page.getByRole('button', { name: 'Shapes', exact: true }).click();

		const inspectorCard = page.locator('.shape-inspector-card');
		const box = await canvas.glyphCanvas.boundingBox();
		if (!box) throw new Error('Expected the glyph canvas to be visible.');
		const at = (fx: number, fy: number) => ({
			x: box.x + fx * box.width,
			y: box.y + fy * box.height
		});

		const firePreview = page
			.locator('#shapesRootPanel .shape-card', { hasText: 'Fire' })
			.first()
			.locator('.reference-preview');
		const previewCenter = await centerOf(firePreview);
		const target = at(0.5, 0.5);
		await page.mouse.move(previewCenter.x, previewCenter.y);
		await page.mouse.down();
		await page.mouse.move(target.x, target.y);
		await page.mouse.up();
		await expect(inspectorCard).toBeVisible();

		// Move it: a real drag commits to history, enabling undo.
		await page.mouse.move(target.x, target.y);
		await page.mouse.down();
		await page.mouse.move(target.x + 70, target.y + 40);
		await page.mouse.up();
		await expect(canvas.undoButton).toBeEnabled();

		// Clicking empty canvas deselects.
		await page.mouse.click(at(0.12, 0.88).x, at(0.12, 0.88).y);
		await expect(inspectorCard).toBeHidden();

		// Clicking the moved shape reselects it.
		await page.mouse.click(target.x + 70, target.y + 40);
		await expect(inspectorCard).toBeVisible();
	});

	// A ring is the spell boundary, so even when dropped last it renders beneath
	// the symbols and a click on an overlapping symbol selects the symbol, not the
	// ring around it.
	test('keeps a ring beneath symbols even when placed last', async ({ page }) => {
		const canvas = new SpellCanvasPage(page);
		await canvas.goto();
		await page.getByRole('button', { name: 'Shapes', exact: true }).click();

		const inspectorCard = page.locator('.shape-inspector-card');
		const canvasBox = await canvas.glyphCanvas.boundingBox();
		if (!canvasBox) throw new Error('Expected the glyph canvas to be visible.');
		const canvasCenter = {
			x: canvasBox.x + canvasBox.width / 2,
			y: canvasBox.y + canvasBox.height / 2
		};
		const corner = {
			x: canvasBox.x + canvasBox.width * 0.06,
			y: canvasBox.y + canvasBox.height * 0.94
		};
		const drop = async (label: string) => {
			const preview = page
				.locator('#shapesRootPanel .shape-card', { hasText: label })
				.first()
				.locator('.reference-preview');
			await preview.scrollIntoViewIfNeeded();
			const previewCenter = await centerOf(preview);
			await page.mouse.move(previewCenter.x, previewCenter.y);
			await page.mouse.down();
			await page.mouse.move(canvasCenter.x, canvasCenter.y);
			await page.mouse.up();
		};

		// Drop the fire sigil first, then deselect so the palette grid is unobscured.
		await drop('Fire');
		await expect(inspectorCard).toContainText('sigil');
		await page.mouse.click(corner.x, corner.y);
		await expect(inspectorCard).toBeHidden();

		// Drop the ring on top of the sigil; it becomes selected.
		await drop('Spell Ring');
		await expect(inspectorCard).toContainText('ring');

		// Clicking the overlap selects the sigil beneath, not the ring on top.
		await page.mouse.click(canvasCenter.x, canvasCenter.y);
		await expect(inspectorCard).toContainText('sigil');
	});
});
