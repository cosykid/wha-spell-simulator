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
	{ id: 'column', displayName: 'Column' },
	{ id: 'levitation', displayName: 'Levitation' },
	{ id: 'region', displayName: 'Region' }
];
