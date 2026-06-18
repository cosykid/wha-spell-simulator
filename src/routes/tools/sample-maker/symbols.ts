/**
 * One sign the Sample Maker can label. `id` doubles as the ground-truth `signId`
 * and the SVG filename under `src/lib/dictionary/svg/<id>.svg`.
 */
export interface SampleSymbol {
	id: string;
	displayName: string;
}

/** The signs offered by the Sample Maker, in display order. */
export const SAMPLE_SYMBOLS: SampleSymbol[] = [
	{ id: 'earth', displayName: 'Earth' },
	{ id: 'fire', displayName: 'Fire' },
	{ id: 'water', displayName: 'Water' },
	{ id: 'light', displayName: 'Light' },
	{ id: 'crystal', displayName: 'Crystal' },
	{ id: 'wind-directs-air', displayName: 'Wind Directs Air' },
	{ id: 'wind-underfoot', displayName: 'Wind Underfoot' },
	{ id: 'aeroform', displayName: 'Aeroform' },
	{ id: 'billowing', displayName: 'Billowing' },
	{ id: 'collection', displayName: 'Collection' },
	{ id: 'column', displayName: 'Column' },
	{ id: 'convergence', displayName: 'Convergence' },
	{ id: 'cool', displayName: 'Cool' },
	{ id: 'crush', displayName: 'Crush' },
	{ id: 'dispersion', displayName: 'Dispersion' },
	{ id: 'empower', displayName: 'Empower' },
	{ id: 'entwine', displayName: 'Entwine' },
	{ id: 'float', displayName: 'Float' },
	{ id: 'focus', displayName: 'Focus' },
	{ id: 'gather', displayName: 'Gather' },
	{ id: 'levitation', displayName: 'Levitation' },
	{ id: 'orb', displayName: 'Orb' },
	{ id: 'pull', displayName: 'Pull' },
	{ id: 'region', displayName: 'Region' },
	{ id: 'repetition', displayName: 'Repetition' },
	{ id: 'weave', displayName: 'Weave' }
];
