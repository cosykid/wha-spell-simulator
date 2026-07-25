<!--
@component
The proof wall: every seal of the open section laid out as plates on one
drafting sheet, rising in with a small stagger. The shared feed extends itself
as the reader nears the foot of the sheet. Empty and loading states are a single
centered notice on the bare sheet.
-->
<script lang="ts">
	import SpellCard from './SpellCard.svelte';
	import LoadingNote from './LoadingNote.svelte';
	import type { LibrarySession } from '$lib/ui/library/library-session.svelte.js';

	interface Props {
		session: LibrarySession;
	}

	let { session }: Props = $props();

	let loading = $derived(session.section === 'shared' ? session.loading : session.grimoire.loading);
	let sentinel = $state<HTMLElement>();

	/** Fetches the next feed page while the reader is still a screen away. */
	$effect(() => {
		if (!sentinel) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					void session.loadMoreShared();
				}
			},
			{ rootMargin: '600px 0px' }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});
</script>

<section class="wall" data-testid="library-book" aria-label="Spell library">
	{#key `${session.section}:${session.sort}`}
		{#if session.spells.length}
			<div class="plates">
				{#each session.spells as spell, index (spell.id)}
					<SpellCard {session} {spell} number={index + 1} stagger={Math.min(index, 14)} />
				{/each}
			</div>
			{#if session.section === 'shared' && session.nextCursor}
				<div class="more-sentinel" bind:this={sentinel} aria-hidden="true"></div>
			{/if}
			{#if loading}
				<LoadingNote text="Fetching more folios" />
			{:else if session.section === 'grimoire' || !session.nextCursor}
				<footer class="colophon">
					<span class="colophon-rule" aria-hidden="true"></span>
					<p class="colophon-note">
						{session.section === 'grimoire' ? 'Here end your spells.' : 'Here end the proofs.'}
					</p>
					<span class="colophon-rule" aria-hidden="true"></span>
				</footer>
			{/if}
		{:else}
			<div class="notice">
				{#if loading}
					<LoadingNote text="Fetching the folios" />
				{:else}
					<p class="notice-text">
						{#if session.section === 'grimoire'}
							You have not saved any spells yet. Save them in the atelier and they gather here.
						{:else}
							No seals shared yet. Draw a spell in the atelier and publish it from My Spells.
						{/if}
					</p>
				{/if}
			</div>
		{/if}
	{/key}
</section>

<style>
	.wall {
		display: grid;
		gap: 26px;
	}

	.plates {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(clamp(150px, 21vw, 215px), 1fr));
		gap: 40px clamp(18px, 2.4vw, 34px);
	}

	.more-sentinel {
		height: 1px;
	}

	/* A colophon closes the sheet once the last plate is set: the printer's line
	   between two hairlines, echoing the masthead rule that opened it. */
	.colophon {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 16px;
		margin-top: 14px;
	}

	.colophon-rule {
		height: 1px;
		background: var(--ink-sepia-20);
	}

	.colophon-note {
		margin: 0;
		font-style: italic;
		font-size: 0.88rem;
		color: var(--muted-ink);
	}

	/* A blank sheet holds one line, centered in the space the plates would fill. */
	.notice {
		display: grid;
		place-items: center;
		min-height: max(46vh, 320px);
	}

	.notice-text {
		max-width: min(46vmin, 300px);
		margin: 0;
		text-align: center;
		font-style: italic;
		font-size: 0.95rem;
		line-height: 1.6;
		color: var(--muted-ink);
	}
</style>
