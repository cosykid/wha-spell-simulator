<!--
@component
The proof wall: every seal of the open section laid out as plates on one
drafting sheet, rising in with a small stagger. The shared feed extends itself
as the reader nears the foot of the sheet. Empty, waiting and failed states are
a single centered notice on the bare sheet.
-->
<script lang="ts">
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import SpellCard from './SpellCard.svelte';
	import LoadingNote from './LoadingNote.svelte';
	import { getAuthState } from '$lib/ui/auth/auth-state.svelte.js';
	import type { LibrarySession } from '$lib/ui/library/library-session.svelte.js';

	interface Props {
		session: LibrarySession;
	}

	let { session }: Props = $props();
	const auth = getAuthState();

	/** How long a plate takes to slide to the place a new sort gives it. */
	const REORDER_MS = 260;

	let loadingFirstPage = $derived(
		session.section === 'shared' ? session.status === 'loading' : session.grimoire.loading
	);
	let loadingMore = $derived(session.section === 'shared' && session.status === 'loading-more');

	/** The line the wall shows when a fetch failed, and the way back from it. */
	let failure = $derived.by(() => {
		if (session.section === 'grimoire') {
			if (session.grimoire.error === 'auth') {
				return {
					text: 'Your sign-in has lapsed.',
					label: 'Sign in',
					run: () => auth.openDialog('login')
				};
			}
			if (session.grimoire.error === 'network') {
				return {
					text: 'Your spells did not come back.',
					label: 'Try again',
					run: () => void session.grimoire.refresh()
				};
			}
			return null;
		}
		if (session.status === 'failed') {
			return {
				text: 'These folios did not come back.',
				label: 'Try again',
				run: () => void session.refreshShared()
			};
		}
		if (session.status === 'more-failed') {
			return {
				text: 'The next folios did not come back.',
				label: 'Try again',
				run: () => void session.loadMoreShared()
			};
		}
		return null;
	});

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

{#snippet failureLine()}
	{#if failure}
		<p class="failure" data-testid="library-failure">
			{failure.text}
			<button type="button" class="ink-action" onclick={failure.run}>{failure.label}</button>
		</p>
	{/if}
{/snippet}

<!-- Keyed on the section alone. Keying on the sort as well remounted every
     plate with the old page's data, replaying the whole stagger cascade for
     what is a reorder of seals the reader is already looking at. -->
<section class="wall" data-testid="library-book" aria-label="Spell library">
	{#key session.section}
		{#if session.spells.length}
			<div class="plates">
				{#each session.spells as spell, index (spell.id)}
					<div class="plate-slot" animate:flip={{ duration: REORDER_MS, easing: cubicOut }}>
						<SpellCard {session} {spell} number={index + 1} stagger={Math.min(index, 14)} />
					</div>
				{/each}
			</div>
			{#if session.section === 'shared' && session.nextCursor}
				<div class="more-sentinel" bind:this={sentinel} aria-hidden="true"></div>
			{/if}
			{#if loadingMore}
				<LoadingNote text="Fetching more folios" />
			{:else if loadingFirstPage}
				<LoadingNote text="Fetching the folios" />
			{:else if failure}
				{@render failureLine()}
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
				{#if loadingFirstPage}
					<LoadingNote text="Fetching the folios" />
				{:else if failure}
					{@render failureLine()}
				{:else}
					<p class="notice-text">
						{#if session.section === 'grimoire'}
							You have not saved any spells yet. Save them in the atelier and they gather here.
						{:else}
							No seals shared yet. Draw a spell in the atelier, save it, then share it from the My
							Spells drawer.
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

	/* The plate cannot carry the reorder animation itself, since only an element
	   directly under the keyed each can. The slot is that element, and grid so the
	   plate still stretches to its row exactly as it did without it. */
	.plate-slot {
		display: grid;
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

	/* A failed fetch reads as the same quiet line as an empty sheet, with the
	   retry set in ink beside it. */
	.failure {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		align-items: baseline;
		justify-content: center;
		margin: 0;
		text-align: center;
		font-style: italic;
		font-size: 0.95rem;
		line-height: 1.6;
		color: var(--muted-ink);
	}

	.ink-action {
		min-height: 0;
		padding: 2px 1px;
		border: 0;
		border-bottom: 1px solid var(--ink-sepia-20);
		border-radius: 0;
		background: none;
		box-shadow: none;
		font-size: 0.8rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-sepia-70);
	}

	.ink-action:hover {
		background: none;
		border-bottom-color: var(--accent);
		color: var(--ink-sepia);
	}

	.ink-action:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
