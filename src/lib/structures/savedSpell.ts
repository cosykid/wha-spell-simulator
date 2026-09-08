/**
 * @file Shapes of stored spells as they travel between server and client. The
 * storage layer produces them and the grimoire drawer, library book, and remote
 * functions all consume them, so they live outside `$lib/server`.
 *
 * A stored spell travels in two pieces. The card is what a plate draws and is
 * small enough to send twenty at a time; the detail is the drawing itself and
 * is fetched for the one spell a reader opens or previews.
 */
import type { SpellIR } from '../types.js';
import type { SpellPresetData } from './spellPreset.js';
import type { SpellThumbnail } from './spellThumbnail.js';

/**
 * Compiled IR payloads beyond this size are stored as null rather than kept. A
 * preview is a nicety; a row large enough to slow the library feed is not.
 */
export const MAX_PREVIEW_IR_BYTES = 20_000;

/** A stored spell as a plate draws it: no drawing, no compiled IR. */
export interface SpellCard {
	id: string;
	name: string;
	element: string | null;
	thumbnail: SpellThumbnail;
	/** Whether the stored IR can drive a replay, so the plate can offer Preview. */
	canPreview: boolean;
	publishedAt: string | null;
	upvoteCount: number;
	updatedAt: string;
}

/** A published card as library visitors see it. */
export interface LibraryCard extends SpellCard {
	author: string;
}

/** What a card leaves behind: fetched when a reader opens or previews one spell. */
export interface SpellDetail {
	id: string;
	data: SpellPresetData;
	previewIr: SpellIR | null;
}

export type LibrarySort = 'top' | 'new';

/** One page of the shared library plus the cursor for the next one. */
export interface LibraryPage {
	spells: LibraryCard[];
	nextCursor: string | null;
}
