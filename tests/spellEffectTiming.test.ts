import assert from 'node:assert/strict';
import test from 'node:test';

import { carrySpellActivation } from '../src/lib/compiler/spellBuilder.js';
import { spellEmission } from '../src/lib/renderer/spellEffectRenderer.js';
import type { SpellIR } from '../src/lib/types.js';

const TILT_MS = 980;

function activeSpell(activatedAt: number, durationSeconds: number): SpellIR {
	// Only the fields spellEmission reads need to be real.
	return {
		active: true,
		activatedAt,
		duration: durationSeconds
	} as unknown as SpellIR;
}

test('effect emits nothing while the canvas is still tilting into the screen', () => {
	const spell = activeSpell(1000, 3);
	// At activation and any time before the tilt finishes, emission stays 0 so the
	// animation does not start until the canvas has tilted in.
	assert.equal(spellEmission(spell, 1000, TILT_MS), 0);
	assert.equal(spellEmission(spell, 1000 + TILT_MS / 2, TILT_MS), 0);
	assert.equal(spellEmission(spell, 1000 + TILT_MS - 1, TILT_MS), 0);
});

test('effect erupts at full strength once the tilt completes', () => {
	const spell = activeSpell(1000, 3);
	assert.equal(spellEmission(spell, 1000 + TILT_MS, TILT_MS), 1);
	assert.equal(spellEmission(spell, 1000 + TILT_MS + 500, TILT_MS), 1);
});

test('spell duration is measured from after the tilt, then fades out', () => {
	const durationSeconds = 3;
	const spell = activeSpell(1000, durationSeconds);
	const durationMs = durationSeconds * 1000;
	// Still full at the end of the duration window (offset by the tilt hold).
	assert.equal(spellEmission(spell, 1000 + TILT_MS + durationMs, TILT_MS), 1);
	// Fades after the duration, and is gone once the fade completes.
	const midFade = spellEmission(spell, 1000 + TILT_MS + durationMs + 210, TILT_MS);
	assert.ok(midFade > 0 && midFade < 1, `expected partial emission during fade, got ${midFade}`);
	assert.equal(spellEmission(spell, 1000 + TILT_MS + durationMs + 1000, TILT_MS), 0);
});

test('ML refinement recompiles keep the original activation timestamp', () => {
	const templatePass = activeSpell(1000, 3);
	const mlPass = activeSpell(1900, 3);
	const carried = carrySpellActivation(templatePass, mlPass);

	assert.equal(carried.activatedAt, 1000);
	// The effect timeline stays anchored to the ring seal, not the refinement.
	assert.equal(spellEmission(carried, 1000 + TILT_MS, TILT_MS), 1);
});

test('activation timestamp is not carried across inactive spells', () => {
	const inactive = { active: false, activatedAt: null } as unknown as SpellIR;
	const activated = activeSpell(2000, 3);

	assert.equal(carrySpellActivation(inactive, activated).activatedAt, 2000);
	assert.equal(carrySpellActivation(null, activated).activatedAt, 2000);
	assert.equal(carrySpellActivation(activated, inactive).activatedAt, null);
});

test('inactive or zero-duration spells never emit', () => {
	assert.equal(spellEmission({ active: false } as unknown as SpellIR, 5000, TILT_MS), 0);
	assert.equal(spellEmission(activeSpell(1000, 0), 5000, TILT_MS), 0);
	assert.equal(spellEmission(null, 5000, TILT_MS), 0);
});
