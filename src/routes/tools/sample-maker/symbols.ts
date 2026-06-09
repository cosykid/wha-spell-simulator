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
	{ id: 'billow', displayName: 'Billow' },
	{ id: 'collection', displayName: 'Collection' },
	{ id: 'column', displayName: 'Column' },
	{ id: 'convergence', displayName: 'Convergence' },
	{ id: 'crush', displayName: 'Crush' },
	{ id: 'earth', displayName: 'Earth' },
	{ id: 'fire', displayName: 'Fire' },
	{ id: 'levitation', displayName: 'Levitation' },
	{ id: 'light', displayName: 'Light' },
	{ id: 'region', displayName: 'Region' },
	{ id: 'water', displayName: 'Water' }
];
