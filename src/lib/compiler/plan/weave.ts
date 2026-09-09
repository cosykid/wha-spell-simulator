/** @file R-22's solid Stretch and R-23's user-authorized creative elemental extensions. */
import type { PlanNote, SignReading, WeaveSpec } from '../../types.js';

const WEAVE_MATERIALS: Record<string, WeaveSpec['material']> = {
	earth: 'stone',
	crystal: 'crystal',
	water: 'water',
	fire: 'fire',
	'wind-directs-air': 'wind',
	'wind-underfoot': 'wind',
	aeroform: 'aeroform',
	light: 'light'
};

export function resolveWeave(signs: SignReading[], sigil: string | null): WeaveSpec | null {
	const material = WEAVE_MATERIALS[sigil ?? ''];
	if (!material || !signs.some((sign) => sign.length > 1e-6)) return null;
	// Count, placement and inversion have no established ribbon-multiplication law.
	return { material };
}

export function weaveNote(weave: WeaveSpec | null): PlanNote {
	if (!weave) return 'weave-needs-solid';
	return weave.material === 'stone' || weave.material === 'crystal'
		? 'weave-solid-demo'
		: 'weave-imagined';
}
