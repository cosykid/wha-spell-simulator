import type { Directionality } from '$lib/structures/labelledSample.js';

/**
 * One sign the Sample Maker can label. `id` doubles as the ground-truth `signId`
 * and the SVG filename under `src/lib/dictionary/svg/<id>.svg`.
 */
export interface SampleSymbol {
	id: string;
	displayName: string;
	/**
	 * Whether orientation is meaningful for this glyph — drives whether a submitted
	 * sample carries a numeric `angle` or `null`. All three start as `directional`;
	 * reclassify here as the labelling conventions firm up.
	 */
	directionality: Directionality;
}

/** The signs offered by the Sample Maker, in display order. */
export const SAMPLE_SYMBOLS: SampleSymbol[] = [
	{ id: 'column', displayName: 'Column', directionality: 'directional' },
	{ id: 'levitation', displayName: 'Levitation', directionality: 'directional' },
	{ id: 'region', displayName: 'Region', directionality: 'directional' }
];
