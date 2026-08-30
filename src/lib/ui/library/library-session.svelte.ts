/**
 * @file State for the library page: the shared-library feed with its sort and
 * cursor pagination, the reader's own grimoire section, and which preview is
 * playing. Created once by the `/library` route.
 */
import { toast } from '@zerodevx/svelte-toast';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { setSpellUpvote } from '$lib/spells/spells.remote.js';
import type { LibrarySort, LibrarySpell, SavedSpell } from '$lib/structures/savedSpell.js';
import { stashPendingCast } from '$lib/ui/spells/castHandoff.js';
import { GrimoireState } from '$lib/ui/spells/grimoire-state.svelte.js';

export type LibrarySection = 'shared' | 'grimoire';

/**
 * What the shared feed is doing, so the wall can say so in one line. The two
 * fetches fail differently: a first page leaves a bare sheet, a next page
 * leaves the plates already read, and each needs its own way back.
 */
export type SharedFeedStatus = 'ready' | 'loading' | 'loading-more' | 'failed' | 'more-failed';

export class LibrarySession {
	section = $state<LibrarySection>('shared');
	sort = $state<LibrarySort>('top');
	shared = $state<LibrarySpell[]>([]);
	nextCursor = $state<string | null>(null);
	/**
	 * Starts loading, not ready. The route prerenders empty and fetches after
	 * mount, so the feed is always already on its way at the first paint, and an
	 * idle status would show the empty-sheet notice for a beat first.
	 */
	status = $state<SharedFeedStatus>('loading');
	/** Spell id whose animated preview is playing. One at a time. */
	playingId = $state<string | null>(null);

	readonly grimoire = new GrimoireState();

	#firstPageSeq = 0;

	/** The spells the open section shows, in page order. */
	spells = $derived<(LibrarySpell | SavedSpell)[]>(
		this.section === 'shared' ? this.shared : this.grimoire.spells
	);

	/** Reloads the shared feed from the first page. */
	refreshShared = async (): Promise<void> => {
		this.status = 'loading';
		await this.#fetchFirstPage();
	};

	/**
	 * Refetches the open section after a sign-in, so likes the reader cast
	 * before this visit show on plates that were fetched as a guest. The wall
	 * keeps its plates, its scroll and its status line while it runs.
	 */
	refreshForViewer = async (): Promise<void> => {
		if (this.section === 'grimoire') {
			await this.grimoire.refresh();
			return;
		}
		await this.#fetchFirstPage();
	};

	/** Appends the next page of the shared feed while one remains. */
	loadMoreShared = async (): Promise<void> => {
		if (!this.nextCursor || this.status === 'loading' || this.status === 'loading-more') {
			return;
		}
		this.status = 'loading-more';
		try {
			const cursor = encodeURIComponent(this.nextCursor);
			const response = await fetch(`/api/spells?scope=library&sort=${this.sort}&cursor=${cursor}`);
			if (!response.ok) {
				throw new Error(`the library feed answered ${response.status}`);
			}
			const page = await response.json();
			this.shared = [...this.shared, ...(page.spells ?? [])];
			this.nextCursor = page.nextCursor ?? null;
			this.status = 'ready';
		} catch {
			// The observer will not fire again for a sentinel the reader has
			// already passed, so the wall's foot has to offer the way back.
			this.status = 'more-failed';
		}
	};

	setSort = (sort: LibrarySort): void => {
		if (this.sort === sort) {
			return;
		}
		this.sort = sort;
		this.playingId = null;
		this.#scrollToSheetTop();
		void this.refreshShared();
	};

	setSection = (section: LibrarySection): void => {
		if (this.section === section) {
			return;
		}
		this.section = section;
		this.playingId = null;
		this.#scrollToSheetTop();
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
			toast.push('That like did not take.');
		}
	};

	/** Sends a spell to the simulator canvas and navigates there. */
	castSpell = (spell: LibrarySpell | SavedSpell): void => {
		if (!stashPendingCast(spell.data)) {
			// Navigating anyway would land the reader on a blank canvas with no
			// hint that the spell was left behind.
			toast.push('The spell could not be carried over.');
			return;
		}
		void goto(resolve('/'));
	};

	togglePreview = (id: string): void => {
		this.playingId = this.playingId === id ? null : id;
	};

	async #fetchFirstPage(): Promise<void> {
		// Sequence-guarded: a sort switch, or the sign-in reload landing over the
		// guest one, must not be overwritten by the page it replaced.
		const seq = ++this.#firstPageSeq;
		try {
			const response = await fetch(`/api/spells?scope=library&sort=${this.sort}`);
			if (!response.ok) {
				throw new Error(`the library feed answered ${response.status}`);
			}
			const page = await response.json();
			if (seq !== this.#firstPageSeq) {
				return;
			}
			this.shared = page.spells ?? [];
			this.nextCursor = page.nextCursor ?? null;
			this.status = 'ready';
		} catch {
			// Whatever plates are up stay up. An empty feed and a failed one are
			// different sheets, so the status carries the difference.
			if (seq === this.#firstPageSeq) {
				this.status = 'failed';
			}
		}
	}

	/** A shorter feed would otherwise leave the reader parked past its foot. */
	#scrollToSheetTop(): void {
		window.scrollTo({ top: 0 });
	}
}
