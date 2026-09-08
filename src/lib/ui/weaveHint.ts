/** @file Explain Stretch's solid target requirement without exposing compiler notes. */
import type { SpellPlan } from '../types.js';

export function weaveHint(plan: SpellPlan | null | undefined): string {
	if (plan?.notes.includes('weave-needs-solid')) {
		return 'Weave needs a solid target. Try earth or crystal.';
	}
	if (plan?.weave) {
		return `Weave softens solid material. A sample of ${plan.weave.material} is pulled into a ribbon here.`;
	}
	return '';
}
