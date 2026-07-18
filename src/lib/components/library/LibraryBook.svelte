<!--
@component
The library as an open book. Spells are laid out two per page face, and leaves
turn around the spine with a staggered fan when jumping several spreads. Ribbon
bookmarks switch between the shared library and the reader's own grimoire, and
the shared section sorts by popularity or recency.
-->
<script lang="ts">
	import BookPage from './BookPage.svelte';
	import SpellCard from './SpellCard.svelte';
	import { getAuthState } from '$lib/ui/auth/auth-state.svelte.js';
	import { SPELLS_PER_PAGE, type LibrarySession } from '$lib/ui/library/library-session.svelte.js';

	interface Props {
		session: LibrarySession;
	}

	let { session }: Props = $props();
	const auth = getAuthState();
	let turner = $derived(session.turner);

	/** Page faces: SPELLS_PER_PAGE spells each. Leaf k = faces 2k and 2k+1. */
	let faces = $derived.by(() => {
		const chunks: (typeof session.spells)[] = [];
		for (let index = 0; index < session.spells.length; index += SPELLS_PER_PAGE) {
			chunks.push(session.spells.slice(index, index + SPELLS_PER_PAGE));
		}
		return chunks;
	});
	let leafCount = $derived(Math.max(1, Math.ceil(faces.length / 2)));
	let atStart = $derived(turner.target <= 0);
	let atEnd = $derived(turner.target >= leafCount);

	function turnNext() {
		if (atEnd) return;
		turner.next(leafCount);
		// Fetch the next feed page while the reader is still a spread away.
		if (session.section === 'shared' && turner.target >= leafCount - 1) {
			void session.loadMoreShared();
		}
	}

	function turnPrevious() {
		if (atStart) return;
		turner.previous(leafCount);
	}

	function openGrimoire() {
		auth.requireUser(() => session.setSection('grimoire'));
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowRight') turnNext();
		else if (event.key === 'ArrowLeft') turnPrevious();
	}

	function leafZ(index: number): number {
		if (turner.turningLeaf === index) {
			return leafCount + 2;
		}
		return index < turner.flippedCount ? index + 1 : leafCount - index;
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#snippet face(index: number)}
	<div class="page-face">
		{#if faces[index]?.length}
			<div class="page-spells">
				{#each faces[index] as spell (spell.id)}
					<SpellCard {session} {spell} />
				{/each}
			</div>
			<p class="folio">{index + 1}</p>
		{:else if index === 0}
			<p class="page-note">
				{#if session.loading}
					Fetching the folios…
				{:else if session.section === 'grimoire'}
					Your grimoire is empty. Save spells in the simulator and they appear here.
				{:else}
					No spells have been shared yet. Be the first to publish one.
				{/if}
			</p>
		{/if}
	</div>
{/snippet}

<section class="library" data-testid="library-book">
	<header class="library-bar">
		<div class="ribbons" role="tablist" aria-label="Library sections">
			<button
				type="button"
				class="ribbon"
				class:active={session.section === 'shared'}
				data-testid="library-section-shared"
				onclick={() => session.setSection('shared')}
			>
				Shared Library
			</button>
			<button
				type="button"
				class="ribbon"
				class:active={session.section === 'grimoire'}
				data-testid="library-section-grimoire"
				onclick={openGrimoire}
			>
				My Grimoire
			</button>
		</div>
		{#if session.section === 'shared'}
			<div class="sort" aria-label="Sort spells">
				<button
					type="button"
					class="sort-option"
					class:active={session.sort === 'top'}
					data-testid="library-sort-top"
					aria-pressed={session.sort === 'top'}
					onclick={() => session.setSort('top')}
				>
					Most praised
				</button>
				<button
					type="button"
					class="sort-option"
					class:active={session.sort === 'new'}
					data-testid="library-sort-new"
					aria-pressed={session.sort === 'new'}
					onclick={() => session.setSort('new')}
				>
					Newest
				</button>
			</div>
		{/if}
	</header>

	<div class="book-stage">
		<div class="turn-cluster">
			<button
				type="button"
				class="turn-button"
				data-testid="library-turn-first"
				disabled={atStart}
				aria-label="Fan back to the first pages"
				onclick={() => turner.turnTo(0, leafCount)}
			>
				«
			</button>
			<button
				type="button"
				class="turn-button"
				data-testid="library-turn-previous"
				disabled={atStart}
				aria-label="Previous pages"
				onclick={turnPrevious}
			>
				‹
			</button>
		</div>

		<div class="book">
			<div class="board board-left" aria-hidden={!atStart}>
				<p class="board-title">Spell Library</p>
				<p class="board-note">
					Spells shared by other witches. Preview them here, or cast them on your own canvas. Turn
					the pages with the arrows or your keyboard.
				</p>
			</div>
			<div class="board board-right">
				<p class="page-note">
					{session.loading ? 'Fetching more folios…' : 'The remaining pages are blank.'}
				</p>
			</div>
			{#each Array.from({ length: leafCount }, (_, index) => index) as index (index)}
				<BookPage flipped={index < turner.flippedCount} zIndex={leafZ(index)}>
					{#snippet front()}
						{@render face(index * 2)}
					{/snippet}
					{#snippet back()}
						{@render face(index * 2 + 1)}
					{/snippet}
				</BookPage>
			{/each}
		</div>

		<div class="turn-cluster">
			<button
				type="button"
				class="turn-button"
				data-testid="library-turn-next"
				disabled={atEnd}
				aria-label="Next pages"
				onclick={turnNext}
			>
				›
			</button>
			<button
				type="button"
				class="turn-button"
				data-testid="library-turn-last"
				disabled={atEnd}
				aria-label="Fan forward to the last pages"
				onclick={() => {
					turner.turnTo(leafCount, leafCount);
					if (session.section === 'shared') void session.loadMoreShared();
				}}
			>
				»
			</button>
		</div>
	</div>
</section>

<style>
	.library {
		display: grid;
		gap: 18px;
		justify-items: center;
	}

	.library-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		align-items: center;
		justify-content: space-between;
		width: min(1080px, 94vw);
	}

	.ribbons {
		display: flex;
		gap: 8px;
	}

	/* Ribbon bookmarks: darker cloth tabs that hang over the book's top edge. */
	.ribbon {
		min-height: 38px;
		padding: 0 18px;
		border: 1px solid var(--warm-wood-deep);
		border-radius: 0 0 10px 10px;
		background: var(--warm-wood);
		color: #f4ebcd;
		font-family: 'Cinzel', serif;
		font-size: 0.9rem;
		letter-spacing: 0.03em;
	}

	.ribbon.active {
		background: var(--warm-wood-deep);
		box-shadow: inset 0 -3px 0 var(--gold);
	}

	.sort {
		display: flex;
		gap: 6px;
	}

	.sort-option {
		min-height: 32px;
		padding: 0 14px;
		font-size: 0.85rem;
	}

	.sort-option.active {
		border-color: var(--warm-wood-deep);
		box-shadow: inset 0 -2px 0 var(--gold);
	}

	.book-stage {
		display: flex;
		gap: 14px;
		align-items: center;
		width: min(1080px, 94vw);
	}

	.turn-cluster {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.turn-button {
		flex: 0 0 auto;
		width: 44px;
		height: 56px;
		font-size: 1.5rem;
		line-height: 1;
	}

	/* The open book: leather boards under parchment leaves, with real depth. */
	.book {
		position: relative;
		flex: 1;
		aspect-ratio: 16 / 11;
		max-height: 72vh;
		perspective: 2400px;
		border-radius: 14px;
		padding: 1.2%;
		background: linear-gradient(180deg, #5c4630, #4a3826);
		box-shadow: var(--shadow, 0 18px 50px rgba(36, 27, 22, 0.4));
	}

	.board {
		position: absolute;
		top: 1.2%;
		bottom: 1.2%;
		width: 48.8%;
		overflow: hidden;
		display: grid;
		align-content: center;
		gap: 10px;
		padding: 4%;
		background: var(--panel, #f2ecd6);
	}

	.board-left {
		left: 1.2%;
		border-radius: 10px 0 0 10px;
	}

	.board-right {
		right: 1.2%;
		border-radius: 0 10px 10px 0;
	}

	.board-title {
		margin: 0;
		font-family: 'Cinzel', serif;
		font-size: 1.5rem;
		color: var(--ink-sepia);
	}

	.board-note,
	.page-note {
		margin: 0;
		font-size: 0.95rem;
		color: var(--muted-ink);
	}

	/* Leaves sit inside the same padded area as the boards. */
	.book :global(.leaf) {
		top: 1.2%;
		bottom: 1.2%;
		left: 50%;
		width: 48.8%;
	}

	.page-face {
		display: grid;
		grid-template-rows: 1fr auto;
		gap: 8px;
		height: 100%;
		padding: 5%;
	}

	.page-spells {
		display: grid;
		gap: 10px;
		align-content: start;
	}

	.folio {
		margin: 0;
		text-align: center;
		font-size: 0.8rem;
		color: var(--muted-ink);
	}

	.page-note {
		align-self: center;
		text-align: center;
	}

	@media (max-width: 760px) {
		.book {
			aspect-ratio: 9 / 12;
		}

		/* On narrow screens the closed-left board is covered by leaves anyway. */
		.board-left,
		.board-right {
			width: 97.6%;
		}

		.book :global(.leaf) {
			left: 1.2%;
			width: 97.6%;
			transform-origin: center left;
		}
	}
</style>
