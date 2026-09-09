/** @file Explain Stretch's solid target requirement without exposing compiler notes. */
import type { FlowWeaveMaterial, SpellPlan } from '../types.js';

const CREATIVE_EFFECTS: Record<FlowWeaveMaterial, string> = {
	water: 'Water flows in a rippling ribbon, then falls back to the seal.',
	fire: 'A flame ribbon flickers upward, then burns away.',
	wind: 'A ribbon of wind circles the seal, then scatters.',
	aeroform: 'A broad band of air billows around the seal, then disperses.',
	light: 'Pulses of light travel around a luminous loop, then fade.'
};

export function weaveHint(plan: SpellPlan | null | undefined): string {
	if (plan?.notes.includes('weave-needs-solid')) {
		return 'Weave needs a solid target. Try earth or crystal.';
	}
	if (plan?.weave && plan.notes.includes('weave-imagined')) {
		return `Creative extension: ${CREATIVE_EFFECTS[plan.weave.material as FlowWeaveMaterial]}`;
	}
	if (plan?.weave) {
		return `Weave softens solid material. A sample of ${plan.weave.material} is pulled into a ribbon here.`;
	}
	return '';
}
