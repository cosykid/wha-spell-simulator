import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_RING, SpellCanvasPage } from './pages/SpellCanvasPage.js';
import { circleStroke } from './helpers/strokes.js';
import { FIRE_SHOOT } from './fixtures/sampleSpells.js';

// The portal tilt runs ~1s before emission starts; give the WebGL layer a
// moment past that to spawn and draw tracers.
const PORTAL_AND_SPAWN_MS = 1600;

/** Non-transparent pixel count of the WebGL field canvas. */
async function litPixels(page: Page): Promise<number> {
	return page.evaluate(() => {
		const gl3d = document.getElementById('fieldCanvas3d') as HTMLCanvasElement;
		const probe = document.createElement('canvas');
		probe.width = gl3d.width;
		probe.height = gl3d.height;
		const ctx = probe.getContext('2d')!;
		ctx.drawImage(gl3d, 0, 0);
		const data = ctx.getImageData(0, 0, probe.width, probe.height).data;
		let lit = 0;
		for (let i = 3; i < data.length; i += 4) {
			if (data[i] > 8) lit++;
		}
		return lit;
	});
}

/** Drags a palette shape card onto the canvas at a normalized position. */
async function dropShape(page: Page, label: string, fx: number, fy: number): Promise<void> {
	const canvasBox = await page.getByTestId('glyph-canvas').boundingBox();
	if (!canvasBox) throw new Error('Glyph canvas is not visible.');
	const preview = page
		.locator('#shapesRootPanel .shape-card', { hasText: label })
		.first()
		.locator('.reference-preview');
	await preview.scrollIntoViewIfNeeded();
	const box = await preview.boundingBox();
	if (!box) throw new Error(`Palette card for ${label} is not visible.`);
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(canvasBox.x + fx * canvasBox.width, canvasBox.y + fy * canvasBox.height, {
		steps: 5
	});
	await page.mouse.up();
	await page.waitForTimeout(150);
}

test.describe('Three.js field effect', () => {
	test('sign-driven spells render on the WebGL canvas', async ({ page }, testInfo) => {
		const canvas = new SpellCanvasPage(page);
		await canvas.goto();

		await canvas.castSpell(FIRE_SHOOT, { skipSeal: true });
		await expect(canvas.statusValue).toHaveText('Prepared spell');
		await canvas.sealRing(DEFAULT_RING);
		await canvas.expectActive();

		// The compiled spell must carry the physical seal (fire + columns map
		// into the sim model), which routes the effect to the 3D layer.
		const sealSigns = await page.evaluate(() => {
			const simulator = (window as never as Record<string, unknown>).__simulator as {
				recognition: { spellIR: { seal: { signs: unknown[] } | null } | null };
			};
			return simulator.recognition.spellIR?.seal?.signs.length ?? 0;
		});
		expect(sealSigns).toBeGreaterThan(0);

		await page.waitForTimeout(PORTAL_AND_SPAWN_MS);

		// The WebGL canvas must contain non-transparent pixels while the spell
		// burns (preserveDrawingBuffer keeps the frame readable).
		expect(await litPixels(page)).toBeGreaterThan(50);

		await testInfo.attach('spell-3d', {
			body: await page.screenshot(),
			contentType: 'image/png'
		});
	});

	// Regression: a pull-only seal manifests no own magic (§7), so its whole
	// visible output is the ambient medium — streaks and the pooled mass have
	// to light the canvas well past the idle-mote noise floor (~3.5k pixels).
	test('pull spells draw a visible ambient inflow', async ({ page }, testInfo) => {
		const canvas = new SpellCanvasPage(page);
		await canvas.goto();

		await page.getByRole('button', { name: 'Shapes', exact: true }).click();
		await dropShape(page, 'Fire', 0.5, 0.5);
		await dropShape(page, 'Pull', 0.5, 0.24);
		await page.mouse.click(100, 100);
		await page.keyboard.press('Escape');
		await page.evaluate(() => {
			const simulator = (window as never as Record<string, unknown>).__simulator as {
				handleSelectDraw(): void;
			};
			simulator.handleSelectDraw();
		});
		await canvas.drawStroke(circleStroke({ x: 0.5, y: 0.5 }, 0.38, -90, 272), { settleMs: 200 });
		await canvas.expectActive();

		// Recognition applies an interim classifier pass before the final one, so
		// poll until the compiled seal carries the pull sign.
		await expect
			.poll(
				() =>
					page.evaluate(() => {
						const simulator = (window as never as Record<string, unknown>).__simulator as {
							recognition: { spellIR: { seal: { signs: { kind: string }[] } | null } | null };
						};
						return simulator.recognition.spellIR?.seal?.signs.map((sign) => sign.kind) ?? [];
					}),
				{ timeout: 10_000 }
			)
			.toContain('pull');

		await page.waitForTimeout(PORTAL_AND_SPAWN_MS);
		expect(await litPixels(page)).toBeGreaterThan(5000);

		await testInfo.attach('pull-3d', {
			body: await page.screenshot(),
			contentType: 'image/png'
		});
	});
});
