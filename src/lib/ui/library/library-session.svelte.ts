/**
 * @file State for the library page: the shared-library feed with its sort and
 * cursor pagination, the reader's own grimoire section, which preview is
 * playing, and which plates this reader has liked. Created once by the
 * `/library` route.
 *
 * A feed page carries cards, not drawings. The drawing behind a plate is
 * fetched through {@link SpellDetails} when the reader opens or previews it,
 * and started early when they merely reach for it.
 */
import { toast } from '@zerodevx/svelte-toast';
import { SvelteSet } from 'svelte/reactivity';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { setSpellUpvote } from '$lib/spells/spells.remote.js';
import type { LibraryCard, LibrarySort, SpellCard } from '$lib/structures/savedSpell.js';
import { stashPendingCast } from '$lib/ui/spells/castHandoff.js';
import { GrimoireState } from '$lib/ui/spells/grimoire-state.svelte.js';
import { SpellDetails } from '$lib/ui/spells/spellDetails.js';

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
	shared = $state<LibraryCard[]>([]);
	nextCursor = $state<string | null>(null);
	/**
	 * Starts loading, not ready. The route prerenders empty and fetches after
	 * mount, so the feed is always already on its way at the first paint, and an
	 * idle status would show the empty-sheet notice for a beat first.
	 */
	status = $state<SharedFeedStatus>('loading');
	/** Spell id whose animated preview is playing. One at a time. */
	playingId = $state<string | null>(null);
	/**
	 * Which plates this reader has liked. Held beside the feed rather than on
	 * its rows, because the feed itself is the same page for every reader.
	 */
	readonly upvotedIds = new SvelteSet<string>();

	readonly grimoire = new GrimoireState();
	readonly details = new SpellDetails();

	#firstPageSeq = 0;

	/** The spells the open section shows, in page order. */
	spells = $derived<(LibraryCard | SpellCard)[]>(
		this.section === 'shared' ? this.shared : this.grimoire.spells
	);

	/** Reloads the shared feed from the first page. */
	refreshShared = async (): Promise<void> => {
		this.status = 'loading';
		await this.#fetchFirstPage();
	};

	/**
	 * Reads this reader's likes after a sign-in, so plates fetched as a guest
	 * show them. The wall keeps its plates, its scroll and its status line while
	 * it runs, and the shared feed is not refetched: it never held the answer.
	 */
	refreshForViewer = async (): Promise<void> => {
		if (this.section === 'grimoire') {
			await this.grimoire.refresh();
			return;
		}
		await this.refreshUpvotes();
	};

	/** Reloads which plates this reader has liked. Guests get an empty set. */
	refreshUpvotes = async (): Promise<void> => {
		try {
			const response = await fetch('/api/spells/upvotes');
			if (!response.ok) {
				throw new Error(`the like list answered ${response.status}`);
			}
			const ids: string[] = (await response.json()).ids ?? [];
			this.upvotedIds.clear();
			for (const id of ids) {
				this.upvotedIds.add(id);
			}
		} catch {
			// Plates simply stay unlit. Liking one still works, and the answer
			// from that write corrects the plate it lands on.
		}
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

	/** Whether this reader has liked a plate. */
	hasUpvoted = (id: string): boolean => this.upvotedIds.has(id);

	/** Optimistically toggles the signed-in reader's upvote on a shared spell. */
	toggleUpvote = async (spell: LibraryCard): Promise<void> => {
		const upvoted = !this.hasUpvoted(spell.id);
		this.#patchUpvote(spell.id, upvoted, upvoted ? 1 : -1);
		const result = await setSpellUpvote({ id: spell.id, upvoted });
		if (result.ok) {
			this.#patchUpvote(spell.id, result.upvoted, 0, result.upvoteCount);
		} else {
			this.#patchUpvote(spell.id, !upvoted, upvoted ? -1 : 1);
			toast.push('That like did not take.');
		}
	};

	/**
	 * Sends a spell to the simulator canvas and navigates there. The drawing is
	 * usually already in hand from {@link reachFor}; when it is not, this is the
	 * fetch that gets it.
	 */
	castSpell = async (spell: LibraryCard | SpellCard): Promise<void> => {
		const detail = await this.details.load(spell.id);
		if (!detail || !stashPendingCast(detail.data)) {
			// Navigating anyway would land the reader on a blank canvas with no
			// hint that the spell was left behind.
			toast.push('The spell could not be carried over.');
			return;
		}
		void goto(resolve('/'));
	};

	/** Starts fetching a plate's drawing while the reader is still deciding. */
	reachFor = (id: string): void => {
		this.details.prefetch(id);
	};

	togglePreview = (id: string): void => {
		this.playingId = this.playingId === id ? null : id;
		if (this.playingId) {
			this.details.prefetch(id);
		}
	};

	#patchUpvote(id: string, upvoted: boolean, delta: number, count?: number): void {
		if (upvoted) {
			this.upvotedIds.add(id);
		} else {
			this.upvotedIds.delete(id);
		}
		this.shared = this.shared.map((entry) =>
			entry.id === id ? { ...entry, upvoteCount: count ?? entry.upvoteCount + delta } : entry
		);
	}

	async #fetchFirstPage(): Promise<void> {
		// Sequence-guarded: a sort switch must not be overwritten by the page it
		// replaced.
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
