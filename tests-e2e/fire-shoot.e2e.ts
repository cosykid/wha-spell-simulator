import { expect, test } from '@playwright/test';
import { DEFAULT_RING, SpellCanvasPage } from './pages/SpellCanvasPage.js';
import { FIRE_SHOOT } from './fixtures/sampleSpells.js';

test.describe('Fire Shoot spell', () => {
	test('draws the example with perfect skill and activates', async ({ page }, testInfo) => {
		const canvas = new SpellCanvasPage(page);
		await canvas.goto();

		// Draw the ring (left open) and place the fire sigil + column signs inside.
		await canvas.castSpell(FIRE_SHOOT, { skipSeal: true });
		await expect(canvas.statusValue).toHaveText('Prepared spell');

		// Seal the ring and time how long the spell takes to become active.
		const activationMs = await canvas.measureActivation(DEFAULT_RING);

		await canvas.expectActive();
		await expect(canvas.elementValue).toHaveText('fire');
		await expect(canvas.manifestationValue).toContainText('column');

		// Report the activation latency as a benchmark on the test report.
		const benchmark = `Fire Shoot activation: ${activationMs.toFixed(1)} ms (circle sealed -> active)`;
		console.log(`[benchmark] ${benchmark}`);
		testInfo.annotations.push({ type: 'benchmark', description: benchmark });
		await testInfo.attach('activation-benchmark.json', {
			contentType: 'application/json',
			body: JSON.stringify(
				{ spell: FIRE_SHOOT.id, metric: 'seal-to-active', milliseconds: activationMs },
				null,
				2
			)
		});
	});
});
