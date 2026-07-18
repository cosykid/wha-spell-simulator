<!--
@component
One spell entry on a book page: glyph thumbnail (or the live preview while
playing), name, author, element, and the preview, cast, and upvote actions.
Serves both sections. Grimoire spells have no author or viewer vote.
-->
<script lang="ts">
	import SpellPreview from './SpellPreview.svelte';
	import { getAuthState } from '$lib/ui/auth/auth-state.svelte.js';
	import { presetPreviewPolylines } from '$lib/ui/spells/presetThumbnail.js';
	import type { LibrarySession } from '$lib/ui/library/library-session.svelte.js';
	import type { LibrarySpell, SavedSpell } from '$lib/structures/savedSpell.js';

	interface Props {
		session: LibrarySession;
		spell: LibrarySpell | SavedSpell;
	}

	let { session, spell }: Props = $props();
	const auth = getAuthState();

	let shared = $derived('author' in spell ? (spell as LibrarySpell) : null);
	let playing = $derived(session.playingId === spell.id);
	let canPreview = $derived(Boolean(spell.previewIr?.valid));

	function upvote() {
		if (!shared) return;
		const target = shared;
		auth.requireUser(() => void session.toggleUpvote(target));
	}
</script>

<article class="spell-card" data-testid="library-spell-card">
	{#if playing && spell.previewIr}
		<SpellPreview
			data={spell.data}
			previewIr={spell.previewIr}
			onEnded={() => session.togglePreview(spell.id)}
		/>
	{:else}
		<svg class="spell-thumb" viewBox="0 0 100 100" aria-hidden="true">
			{#each presetPreviewPolylines(spell.data) as points (points)}
				<polyline {points} />
			{/each}
		</svg>
	{/if}

	<header class="spell-heading">
		<h3 class="spell-name">{spell.name}</h3>
		<p class="spell-sub">
			<span class="spell-element">{spell.element ?? 'unknown'}</span>
			{#if shared}
				· by {shared.author}
			{/if}
		</p>
	</header>

	<footer class="spell-actions">
		{#if canPreview}
			<button
				type="button"
				class="card-action"
				data-testid="spell-preview-toggle"
				onclick={() => session.togglePreview(spell.id)}
			>
				{playing ? 'Still' : 'Preview'}
			</button>
		{/if}
		<button
			type="button"
			class="card-action"
			data-testid="spell-cast-button"
			onclick={() => session.castSpell(spell)}
		>
			Cast
		</button>
		{#if shared}
			<button
				type="button"
				class="card-action vote"
				class:voted={shared.viewerUpvoted}
				data-testid="spell-upvote-button"
				aria-pressed={shared.viewerUpvoted}
				onclick={upvote}
			>
				▲ {spell.upvoteCount}
			</button>
		{/if}
	</footer>
</article>

<style>
	.spell-card {
		display: grid;
		grid-template-columns: 92px 1fr;
		grid-template-rows: auto auto;
		gap: 4px 12px;
		align-items: start;
		padding: 10px;
		border: 1px solid var(--ink-sepia-20);
		border-radius: 6px;
		background: rgba(255, 252, 240, 0.35);
	}

	.spell-card :global(.preview-stage),
	.spell-thumb {
		grid-row: 1 / span 2;
		width: 92px;
		height: 92px;
	}

	.spell-thumb {
		border: 1px solid var(--ink-sepia-20);
		border-radius: 6px;
		background: var(--panel);
	}

	.spell-thumb polyline {
		fill: none;
		stroke: var(--ink);
		stroke-width: 2.4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.spell-heading {
		min-width: 0;
	}

	.spell-name {
		margin: 0;
		font-family: 'Cinzel', serif;
		font-size: 1.02rem;
		line-height: 1.25;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.spell-sub {
		margin: 2px 0 0;
		font-size: 0.82rem;
		color: var(--muted-ink);
	}

	/* Element names read as proper nouns. Usernames stay exactly as typed. */
	.spell-element {
		text-transform: capitalize;
	}

	.spell-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-self: end;
	}

	.card-action {
		min-height: 30px;
		padding: 0 12px;
		font-size: 0.82rem;
	}

	.vote.voted {
		color: var(--ember);
		border-color: var(--ember);
	}
</style>
