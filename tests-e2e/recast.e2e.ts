/**
 * A spell that becomes active again performs again.
 *
 * "Active spell" on the status line is not the assertion here. A reactivation
 * that inherits the finished cast's clock reads exactly the same and paints
 * nothing at all, so this spec watches the effect canvas instead.
 *
 * Undo and redo over a sealed ring are the way in. Recognition is async, the
 * keyboard runs both before the pass in between has landed, and the spell
 * therefore never falls out of active for anything downstream to notice the
 * seal was gone and back.
 */

import { expect, test } from '@playwright/test';
import { TOTAL_MS_RANGE } from '../src/lib/cast/score/beats.js';
import { FIRE_SHOOT } from './fixtures/sampleSpells.js';
import { SpellCanvasPage } from './pages/SpellCanvasPage.js';

/** The longest cast R-01 allows, plus slack for the timer that flips the note. */
const SPENT_DEADLINE_MS = TOTAL_MS_RANGE.max + 3000;

test.describe('Recasting one drawing', () => {
	// The spell is cast twice, with its whole duration waited out between.
	test.slow();

	test('undo and redo over a spent seal casts it again', async ({ page }) => {
		const canvas = new SpellCanvasPage(page);
		await canvas.goto();
		await canvas.castSpell(FIRE_SHOOT);
		await canvas.expectActive();
		await expect(canvas.statusNote).toBeVisible({ timeout: SPENT_DEADLINE_MS });

		// A spent one-shot leaves the stage empty, so any ink from here is the
		// second cast's own.
		await expect.poll(() => canvas.readCastInk()).toBe(0);

		await canvas.undoShortcut();
		await canvas.redoShortcut();

		await canvas.expectActive();
		await canvas.waitForCastInk();
	});
});
