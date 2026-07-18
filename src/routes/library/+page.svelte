<!--
@component
The spell library route: a book of shared spells and the reader's grimoire.
The shell prerenders empty and the feed loads client-side after mount, like the
rest of the app.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import LibraryBook from '$lib/components/library/LibraryBook.svelte';
	import { LibrarySession } from '$lib/ui/library/library-session.svelte.js';

	const session = new LibrarySession();

	onMount(() => {
		void session.refreshShared();
	});
</script>

<svelte:head>
	<title>Spell Library — Witch Hat Atelier Spell Simulator</title>
</svelte:head>

<main class="library-page">
	<nav class="library-nav">
		<a href={resolve('/')}>← Back to the atelier</a>
	</nav>
	<LibraryBook {session} />
</main>

<style>
	.library-page {
		display: grid;
		gap: 16px;
		min-height: 100vh;
		align-content: start;
		padding: 22px clamp(12px, 3vw, 40px) 48px;
	}

	.library-nav a {
		color: var(--ink-sepia, #38291a);
		font-size: 0.95rem;
		text-decoration: none;
	}

	.library-nav a:hover {
		text-decoration: underline;
	}
</style>
