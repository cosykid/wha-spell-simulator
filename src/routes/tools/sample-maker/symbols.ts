/**
 * One sign the Sample Maker can label. `id` doubles as the ground-truth `signId`
 * and the SVG filename under `src/lib/dictionary/svg/<id>.svg`.
 */
export interface SampleSymbol {
	id: string;
	displayName: string;
	difficulty?: 'easy' | 'medium' | 'hard' | 'very-hard';
}

/** The signs offered by the Sample Maker, in display order. */
export const SAMPLE_SYMBOLS: SampleSymbol[] = [
	{ id: 'earth', displayName: 'Earth', difficulty: 'easy' },
	{ id: 'fire', displayName: 'Fire', difficulty: 'easy' },
	{ id: 'water', displayName: 'Water', difficulty: 'easy' },
	{ id: 'light', displayName: 'Light', difficulty: 'medium' },
	{ id: 'crystal', displayName: 'Crystal', difficulty: 'easy' },
	{ id: 'wind-directs-air', displayName: 'Wind Directs Air', difficulty: 'hard' },
	{ id: 'wind-underfoot', displayName: 'Wind Underfoot', difficulty: 'very-hard' },
	{ id: 'aeriforms', displayName: 'Aeriforms', difficulty: 'very-hard' },
	{ id: 'billowing', displayName: 'Billowing', difficulty: 'hard' },
	{ id: 'collection', displayName: 'Collection', difficulty: 'easy' },
	{ id: 'column', displayName: 'Column', difficulty: 'easy' },
	{ id: 'convergence', displayName: 'Convergence', difficulty: 'medium' },
	{ id: 'cool', displayName: 'Cool', difficulty: 'hard' },
	{ id: 'crush', displayName: 'Crush', difficulty: 'easy' },
	{ id: 'dispersion', displayName: 'Dispersion', difficulty: 'easy' },
	{ id: 'empower', displayName: 'Empower', difficulty: 'easy' },
	{ id: 'entwine', displayName: 'Entwine', difficulty: 'medium' },
	{ id: 'float', displayName: 'Float', difficulty: 'medium' },
	{ id: 'focus', displayName: 'Focus', difficulty: 'easy' },
	{ id: 'gather', displayName: 'Gather', difficulty: 'easy' },
	{ id: 'levitation', displayName: 'Levitation', difficulty: 'medium' },
	{ id: 'orb', displayName: 'Orb', difficulty: 'easy' },
	{ id: 'pull', displayName: 'Pull', difficulty: 'easy' },
	{ id: 'region', displayName: 'Region', difficulty: 'easy' },
	{ id: 'repetition', displayName: 'Repetition', difficulty: 'very-hard' },
	{ id: 'weave', displayName: 'Weave', difficulty: 'medium' }
];
