/** @file R-22: Stretch softens solid targets. Only stone and crystal are modeled here. */
import type { SignReading, WeaveSpec } from '../../types.js';

const SOLID_TARGETS: Record<string, WeaveSpec['material']> = {
	earth: 'stone',
	crystal: 'crystal'
};

export function resolveWeave(signs: SignReading[], sigil: string | null): WeaveSpec | null {
	const material = SOLID_TARGETS[sigil ?? ''];
	if (!material || !signs.some((sign) => sign.length > 1e-6)) return null;
	// Count, placement and inversion have no established ribbon-multiplication law.
	return { material };
}
