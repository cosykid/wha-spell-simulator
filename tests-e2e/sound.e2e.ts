import { expect, test, type Page } from '@playwright/test';
import { FIRE_SHOOT } from './fixtures/sampleSpells.js';
import { DEFAULT_RING, SpellCanvasPage } from './pages/SpellCanvasPage.js';

/**
 * The cast heard. A page cannot be asked what it played, so Web Audio is
 * instrumented before the app loads: every context the app creates is kept,
 * and every loudness curve written onto a gain param is counted. A cast is
 * scheduled in one pass (`cast/sound/perform.ts`), so a running context with
 * curves on it is the whole proof that the seal was heard.
 */
interface AudioProbe {
	contexts: number;
	states: string[];
	curves: number;
}

declare global {
	interface Window {
		__audioProbe?: AudioProbe;
	}
}

async function instrumentAudio(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const probe: AudioProbe = { contexts: 0, states: [], curves: 0 };
		const contexts: AudioContext[] = [];
		window.__audioProbe = probe;
		const Original = window.AudioContext;
		window.AudioContext = class extends Original {
			constructor(options?: AudioContextOptions) {
				super(options);
				contexts.push(this);
				probe.contexts += 1;
			}
		};
		const scheduleCurve = AudioParam.prototype.setValueCurveAtTime;
		AudioParam.prototype.setValueCurveAtTime = function (values, startTime, duration) {
			probe.curves += 1;
			return scheduleCurve.call(this, values, startTime, duration);
		};
		Object.defineProperty(probe, 'states', {
			get: () => contexts.map((context) => context.state)
		});
	});
}

async function readProbe(page: Page): Promise<AudioProbe> {
	return page.evaluate(() => {
		const probe = window.__audioProbe!;
		return { contexts: probe.contexts, states: probe.states, curves: probe.curves };
	});
}

test.describe('the cast heard', () => {
	test('sealing a ring schedules the cast on a running audio context', async ({ page }) => {
		await instrumentAudio(page);
		const canvas = new SpellCanvasPage(page);
		await canvas.goto();

		// Nothing plays before a seal, whatever the caster has already drawn.
		await canvas.castSpell(FIRE_SHOOT, { skipSeal: true });
		expect((await readProbe(page)).curves).toBe(0);

		await canvas.sealRing(DEFAULT_RING);
		await canvas.expectActive();

		// One context, running off the strokes' own gestures, with the charge, the
		// medium and the fire's own beam each written onto a gain of their own.
		await expect.poll(async () => (await readProbe(page)).curves).toBeGreaterThanOrEqual(3);
		const probe = await readProbe(page);
		expect(probe.contexts).toBe(1);
		expect(probe.states).toEqual(['running']);
	});

	test('the mute toggle flips, answers M, survives a reload, and never unschedules the cast', async ({
		page
	}) => {
		await instrumentAudio(page);
		const canvas = new SpellCanvasPage(page);
		await canvas.goto();
		await expect(canvas.soundToggle).toHaveAttribute('aria-pressed', 'false');

		await canvas.soundToggle.click();
		await expect(canvas.soundToggle).toHaveAttribute('aria-pressed', 'true');

		await page.keyboard.press('m');
		await expect(canvas.soundToggle).toHaveAttribute('aria-pressed', 'false');
		await page.keyboard.press('m');
		await expect(canvas.soundToggle).toHaveAttribute('aria-pressed', 'true');

		await canvas.goto();
		await expect(canvas.soundToggle).toHaveAttribute('aria-pressed', 'true');

		// Muted is a ramp on the master, not a skipped schedule, so a cast sealed
		// in silence is still written and unmuting lands mid-performance.
		await canvas.castSpell(FIRE_SHOOT);
		await canvas.expectActive();
		await expect.poll(async () => (await readProbe(page)).curves).toBeGreaterThanOrEqual(3);

		await canvas.soundToggle.click();
		await expect(canvas.soundToggle).toHaveAttribute('aria-pressed', 'false');
	});
});
