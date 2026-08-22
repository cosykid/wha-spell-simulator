/**
 * The reference cast, end to end through the shipping engine: draw, seal,
 * activate, then read R-01's beats off the effect canvas.
 *
 * The assertions are deliberately coarse. Whether the fire looks right is the
 * look golden tier's question; this spec only proves the production wiring —
 * that the simulator's effect canvas is the cast engine, that the charge beat
 * carries the ambient medium while the paper is still tilting, that the strike
 * brings the spell's own manifestation, and that the whole thing is a one-shot.
 */

import { expect, test } from '@playwright/test';
import { DEFAULT_RING, SpellCanvasPage } from './pages/SpellCanvasPage.js';
import { FIRE_SHOOT } from './fixtures/sampleSpells.js';
import { BEAT_MS, TOTAL_MS_RANGE } from '../src/lib/cast/score/beats.js';

/** Inside the charge beat, which spans the portal tilt. */
const CHARGE_AT_MS = 600;
/** Inside the strike, which opens at the end of the charge and runs 320ms. */
const STRIKE_AT_MS = BEAT_MS.charge + 170;
/** Well inside the body, the elastic beat. */
const BODY_AT_MS = 2200;
/** Past the longest cast R-01 allows, plus room for the frame that clears it. */
const CAST_DEADLINE_MS = TOTAL_MS_RANGE.max + 1000;

/**
 * The charge carries the ambient medium alone, so it is thin by design; the
 * body carries the spell itself. Both bounds sit far from the measured values
 * (roughly 0.2% and 0.9% of the canvas) because this is a wiring gate.
 */
const MAX_CHARGE_SHARE_OF_BODY = 0.5;
const MIN_BODY_COVERAGE = 0.003;

test.describe('Fire Shoot spell', () => {
	// The spec plays a whole cast and then waits for it to end, on top of drawing
	// thirteen strokes through real pointer input.
	test.slow();

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

		// One pass, so the round trip between samples cannot step the cast past a beat.
		const [charge, strike, body] = await canvas.sampleCast([
			CHARGE_AT_MS,
			STRIKE_AT_MS,
			BODY_AT_MS
		]);

		expect(charge.takenAtMs, 'charge sample landed inside the charge beat').toBeLessThan(
			BEAT_MS.charge
		);
		expect(charge.coverage, 'the ambient medium draws in during the portal tilt').toBeGreaterThan(
			0
		);
		expect(charge.coverage, 'the charge carries the medium only, not the spell').toBeLessThan(
			body.coverage * MAX_CHARGE_SHARE_OF_BODY
		);
		expect(strike.coverage, 'the strike brings the spell itself').toBeGreaterThan(charge.coverage);
		expect(body.coverage, 'the body is the spell at full width').toBeGreaterThan(MIN_BODY_COVERAGE);

		const endedAtMs = await canvas.waitForCastEnd(CAST_DEADLINE_MS);
		expect(endedAtMs, 'a cast is a one-shot and clears itself').toBeLessThan(CAST_DEADLINE_MS);

		// Report the activation latency as a benchmark on the test report.
		const benchmark = `Fire Shoot activation: ${activationMs.toFixed(1)} ms (circle sealed -> active)`;
		console.log(`[benchmark] ${benchmark}`);
		testInfo.annotations.push({ type: 'benchmark', description: benchmark });
		await testInfo.attach('activation-benchmark.json', {
			contentType: 'application/json',
			body: JSON.stringify(
				{
					spell: FIRE_SHOOT.id,
					metric: 'seal-to-active',
					milliseconds: activationMs,
					cast: { charge, strike, body, endedAtMs }
				},
				null,
				2
			)
		});
	});
});
