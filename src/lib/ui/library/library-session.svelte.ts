/**
 * @file State for the library book page: the shared-library feed with its sort
 * and pagination, the reader's own grimoire section, which preview is playing,
 * and the page turner. Created once by the `/library` route.
 */
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { setSpellUpvote } from '$lib/spells/spells.remote.js';
import type { LibrarySort, LibrarySpell, SavedSpell } from '$lib/structures/savedSpell.js';
import { stashPendingCast } from '$lib/ui/spells/castHandoff.js';
import { GrimoireState } from '$lib/ui/spells/grimoire-state.svelte.js';
import { PageTurner } from './page-turn.svelte.js';

export type LibrarySection = 'shared' | 'grimoire';

/** Spells shown per page face. A spread shows two faces. */
export const SPELLS_PER_PAGE = 2;

export class LibrarySession {
	section = $state<LibrarySection>('shared');
	sort = $state<LibrarySort>('top');
	shared = $state<LibrarySpell[]>([]);
	nextCursor = $state<string | null>(null);
	loading = $state(false);
	/** Spell id whose animated preview is playing. One at a time. */
	playingId = $state<string | null>(null);

	readonly grimoire = new GrimoireState();
	readonly turner = new PageTurner();

	/** The spells the open section shows, in page order. */
	spells = $derived<(LibrarySpell | SavedSpell)[]>(
		this.section === 'shared' ? this.shared : this.grimoire.spells
	);

	/** Reloads the shared feed from the first page. */
	refreshShared = async (): Promise<void> => {
		this.loading = true;
		try {
			const response = await fetch(`/api/spells?scope=library&sort=${this.sort}`);
			const page = response.ok ? await response.json() : { spells: [], nextCursor: null };
			this.shared = page.spells ?? [];
			this.nextCursor = page.nextCursor ?? null;
		} catch {
			this.shared = [];
			this.nextCursor = null;
		} finally {
			this.loading = false;
		}
	};

	/** Appends the next page of the shared feed while one remains. */
	loadMoreShared = async (): Promise<void> => {
		if (!this.nextCursor || this.loading) {
			return;
		}
		this.loading = true;
		try {
			const cursor = encodeURIComponent(this.nextCursor);
			const response = await fetch(`/api/spells?scope=library&sort=${this.sort}&cursor=${cursor}`);
			if (response.ok) {
				const page = await response.json();
				this.shared = [...this.shared, ...(page.spells ?? [])];
				this.nextCursor = page.nextCursor ?? null;
			}
		} finally {
			this.loading = false;
		}
	};

	setSort = (sort: LibrarySort): void => {
		if (this.sort === sort) {
			return;
		}
		this.sort = sort;
		this.turner.reset();
		this.playingId = null;
		void this.refreshShared();
	};

	setSection = (section: LibrarySection): void => {
		if (this.section === section) {
			return;
		}
		this.section = section;
		this.turner.reset();
		this.playingId = null;
		if (section === 'grimoire') {
			void this.grimoire.refresh();
		}
	};

	/** Optimistically toggles the signed-in reader's upvote on a shared spell. */
	toggleUpvote = async (spell: LibrarySpell): Promise<void> => {
		const upvoted = !spell.viewerUpvoted;
		const patch = (value: boolean, delta: number) => {
			this.shared = this.shared.map((entry) =>
				entry.id === spell.id
					? { ...entry, viewerUpvoted: value, upvoteCount: entry.upvoteCount + delta }
					: entry
			);
		};
		patch(upvoted, upvoted ? 1 : -1);
		const result = await setSpellUpvote({ id: spell.id, upvoted });
		if (result.ok) {
			this.shared = this.shared.map((entry) =>
				entry.id === spell.id
					? { ...entry, viewerUpvoted: result.upvoted, upvoteCount: result.upvoteCount }
					: entry
			);
		} else {
			patch(!upvoted, upvoted ? -1 : 1);
		}
	};

	/** Sends a spell to the simulator canvas and navigates there. */
	castSpell = (spell: LibrarySpell | SavedSpell): void => {
		stashPendingCast(spell.data);
		void goto(resolve('/'));
	};

	togglePreview = (id: string): void => {
		this.playingId = this.playingId === id ? null : id;
	};
}
