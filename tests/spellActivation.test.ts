/**
 * `carrySpellActivation`: the cast clock's origin surviving a recompile.
 *
 * Recognition emits a fast template result and then one or more ML refinements
 * for the same ink, and each pass recompiles. `activatedAt` is where the cast
 * clock starts, so a fresh one would restart the performance from the charge
 * beat and the spell would begin only after the last refinement. What the clock
 * then does with that origin is the score's business, in `spellScore.test.ts`.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { carrySpellActivation } from '../src/lib/compiler/spellBuilder.js';
import type { SpellIR } from '../src/lib/types.js';

function activeSpell(activatedAt: number): SpellIR {
	// Only the fields carrySpellActivation reads need to be real.
	return { active: true, activatedAt } as unknown as SpellIR;
}

test('ML refinement recompiles keep the original activation timestamp', () => {
	const templatePass = activeSpell(1000);
	const mlPass = activeSpell(1900);

	assert.equal(carrySpellActivation(templatePass, mlPass).activatedAt, 1000);
});

test('activation timestamp is not carried across inactive spells', () => {
	const inactive = { active: false, activatedAt: null } as unknown as SpellIR;
	const activated = activeSpell(2000);

	assert.equal(carrySpellActivation(inactive, activated).activatedAt, 2000);
	assert.equal(carrySpellActivation(null, activated).activatedAt, 2000);
	assert.equal(carrySpellActivation(activated, inactive).activatedAt, null);
});
