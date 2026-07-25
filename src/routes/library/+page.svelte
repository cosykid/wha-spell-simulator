<!--
@component
The spell library route: the atelier's proof sheet of shared seals and the
reader's own saved spells, on the same parchment as the drawing canvas. The shell
prerenders empty and the feed loads client-side after mount, like the rest of
the app.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import LibraryMasthead from '$lib/components/library/LibraryMasthead.svelte';
	import LibraryWall from '$lib/components/library/LibraryWall.svelte';
	import { LibrarySession } from '$lib/ui/library/library-session.svelte.js';

	const session = new LibrarySession();

	onMount(() => {
		void session.refreshShared();
	});
</script>

<svelte:head>
	<title>Spell Library — Witch Hat Atelier Spell Simulator</title>
</svelte:head>

<main class="sheet">
	<div class="sheet-paper" aria-hidden="true"></div>
	<div class="sheet-inner">
		<nav class="sheet-nav">
			<a href={resolve('/')}>← Back to the atelier</a>
		</nav>
		<LibraryMasthead {session} />
		<LibraryWall {session} />
	</div>
</main>

<style>
	/* Flat parchment on the sheet itself, so renderers that drop the pinned
	   texture layer still show paper, never the dark app backdrop. */
	.sheet {
		min-height: 100vh;
		background: #d9cba6;
	}

	/* The same parchment the drawing canvas sits on, pinned so the sheet reads
	   as one continuous surface however far the wall scrolls. */
	.sheet-paper {
		position: fixed;
		inset: 0;
		z-index: 0;
		background: #d9cba6 url('/images/background.jpg') center / cover no-repeat;
		box-shadow: inset 0 0 140px rgba(92, 70, 48, 0.28);
	}

	.sheet-inner {
		position: relative;
		z-index: 1;
		width: min(1480px, 94vw);
		margin: 0 auto;
		padding: 34px 0 72px;
		display: grid;
		gap: 22px;
		align-content: start;
	}

	.sheet-nav a {
		font-style: italic;
		font-size: 0.92rem;
		letter-spacing: 0.03em;
		color: var(--ink-sepia-70);
		text-decoration: none;
		border-bottom: 1px solid transparent;
		transition: color 180ms ease;
	}

	.sheet-nav a:hover {
		color: var(--ink-sepia);
		border-bottom-color: var(--gold);
	}

	.sheet-nav a:focus-visible {
		outline: 2px solid var(--gold);
		outline-offset: 3px;
	}

	@media (max-width: 900px) {
		.sheet-nav {
			text-align: center;
		}
	}
</style>
