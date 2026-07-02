import { expect, test, type Locator } from '@playwright/test';
import { SpellCanvasPage } from './pages/SpellCanvasPage.js';

async function centerOf(locator: Locator): Promise<{ x: number; y: number }> {
	await locator.scrollIntoViewIfNeeded();
	await expect(locator).toBeVisible();
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

		// Drag the shape. Selection and hit-testing react synchronously, so the
		// deselect/reselect below prove the placement behavior is live without
		// depending on the (async, ML-backed) recognition pass that drives undo.
		await page.mouse.move(target.x, target.y);
		await page.mouse.down();
		await page.mouse.move(target.x + 70, target.y + 40);
		await page.mouse.up();

		// Clicking empty canvas deselects.
		await page.mouse.click(at(0.12, 0.88).x, at(0.12, 0.88).y);
		await expect(inspectorCard).toBeHidden();

		// Clicking the placed shape reselects it.
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

	// Copy/paste clones a selected placement in arrange mode. The copy keeps the
	// same kind and source and lands as a new selected shape, leaving the original
	// behind (proven by deleting the copy and reselecting the original).
	test('copies and pastes a placement, preserving its kind and source', async ({ page }) => {
		const canvas = new SpellCanvasPage(page);
		await canvas.goto();
		await page.getByRole('button', { name: 'Shapes', exact: true }).click();

		const inspectorCard = page.locator('.shape-inspector-card');
		const firePreview = page
			.locator('#shapesRootPanel .shape-card', { hasText: 'Fire' })
			.first()
			.locator('.reference-preview');
		const previewCenter = await centerOf(firePreview);
		const canvasCenter = await centerOf(canvas.glyphCanvas);

		// Drop a fire sigil. The drop switches to arrange mode and selects it.
		await page.mouse.move(previewCenter.x, previewCenter.y);
		await page.mouse.down();
		await page.mouse.move(canvasCenter.x, canvasCenter.y);
		await page.mouse.up();
		await expect(inspectorCard).toContainText('fire');
		await expect(inspectorCard).toContainText('sigil');

		// Copy, then paste a cascaded copy. Paste selects the new shape, so the
		// inspector still shows a fire sigil.
		await page.keyboard.press('ControlOrMeta+c');
		await page.keyboard.press('ControlOrMeta+v');
		await expect(inspectorCard).toContainText('fire');
		await expect(inspectorCard).toContainText('sigil');

		// Deleting the pasted copy leaves the original behind: clicking its center
		// reselects a fire sigil, proving paste created a second placement.
		await page.keyboard.press('Delete');
		await expect(inspectorCard).toBeHidden();
		await page.mouse.click(canvasCenter.x, canvasCenter.y);
		await expect(inspectorCard).toContainText('fire');
		await expect(inspectorCard).toContainText('sigil');
	});
});
