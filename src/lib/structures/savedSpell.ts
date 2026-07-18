/**
 * @file Shapes of stored spells as they travel between server and client. The
 * storage layer produces them and the grimoire drawer, library book, and remote
 * functions all consume them, so they live outside `$lib/server`.
 */
import type { SpellIR } from '../types.js';
import type { SpellPresetData } from './spellPreset.js';

/** A spell as its owner sees it in the grimoire. */
export interface SavedSpell {
	id: string;
	name: string;
	element: string | null;
	data: SpellPresetData;
	previewIr: SpellIR | null;
	publishedAt: string | null;
	upvoteCount: number;
	updatedAt: string;
}

/** A published spell as library visitors see it. */
export interface LibrarySpell extends SavedSpell {
	author: string;
	viewerUpvoted: boolean;
}

export type LibrarySort = 'top' | 'new';

/** One page of the shared library plus the cursor for the next one. */
export interface LibraryPage {
	spells: LibrarySpell[];
	nextCursor: string | null;
}
