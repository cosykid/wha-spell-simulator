<!--
@component
One seal proofed on the library sheet: the glyph fitted large on bare paper, a
catalog caption beneath (plate number, name, element, author, likes), and inked
text actions that surface on hover. Serves both sections; grimoire spells have
no author or like tally.
-->
<script lang="ts">
	import SpellPreview from './SpellPreview.svelte';
	import LikeButton from './LikeButton.svelte';
	import { getAuthState } from '$lib/ui/auth/auth-state.svelte.js';
	import { presetPreviewPolylines } from '$lib/ui/spells/presetThumbnail.js';
	import type { LibrarySession } from '$lib/ui/library/library-session.svelte.js';
	import type { LibrarySpell, SavedSpell } from '$lib/structures/savedSpell.js';

	interface Props {
		session: LibrarySession;
		spell: LibrarySpell | SavedSpell;
		/** Position in the open section's feed. Under "most praised" it is a rank. */
		number: number;
		/** Reveal-animation slot, capped by the wall so late rows rise together. */
		stagger?: number;
	}

	let { session, spell, number, stagger = 0 }: Props = $props();
	const auth = getAuthState();

	let shared = $derived('author' in spell ? (spell as LibrarySpell) : null);
	let playing = $derived(session.playingId === spell.id);
	let canPreview = $derived(Boolean(spell.previewIr?.valid));

	/** Catalog date for the plate line: publication for shared seals, last touch
	 * for the grimoire's own. */
	let plateDate = $derived.by(() => {
		const stamp = shared ? shared.publishedAt : spell.updatedAt;
		if (!stamp) return null;
		const date = new Date(stamp);
		return Number.isNaN(date.getTime())
			? null
			: date.toLocaleDateString('en', { month: 'short', year: 'numeric' });
	});

	function upvote() {
		if (!shared) return;
		const target = shared;
		auth.requireUser(() => void session.toggleUpvote(target));
	}
</script>

<article class="plate" data-testid="library-spell-card" style:--stagger={stagger}>
	<div class="figure">
		{#if playing && spell.previewIr}
			<SpellPreview
				data={spell.data}
				previewIr={spell.previewIr}
				onEnded={() => session.togglePreview(spell.id)}
			/>
		{:else}
			<svg class="glyph" viewBox="0 0 100 100" aria-hidden="true">
				{#each presetPreviewPolylines(spell.data) as points (points)}
					<polyline {points} />
				{/each}
			</svg>
		{/if}
	</div>

	<p class="plate-no">
		No. {number}{#if plateDate}&nbsp;·&nbsp;{plateDate}{/if}
	</p>
	<h3 class="spell-name">{spell.name}</h3>
	<p class="spell-sub">
		<span class="spell-element">{spell.element ?? 'unknown'}</span>
		{#if shared}
			<span class="inscribed">inscribed by {shared.author}</span>
		{/if}
	</p>
	{#if shared}
		<div class="like-row">
			<LikeButton spell={shared} onLike={upvote} />
		</div>
	{/if}

	<footer class="actions">
		{#if canPreview}
			<button
				type="button"
				class="ink-action"
				data-testid="spell-preview-toggle"
				onclick={() => session.togglePreview(spell.id)}
			>
				{playing ? 'Still' : 'Preview'}
			</button>
		{/if}
		<button
			type="button"
			class="ink-action"
			data-testid="spell-cast-button"
			onclick={() => session.castSpell(spell)}
		>
			Cast
		</button>
	</footer>
</article>

<style>
	/* No box, no shadow: the plate is ink sitting directly on the shared sheet. */
	.plate {
		display: grid;
		gap: 2px;
		justify-items: center;
		text-align: center;
		animation: plate-rise 420ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
		animation-delay: calc(var(--stagger) * 30ms);
	}

	@keyframes plate-rise {
		from {
			opacity: 0;
			translate: 0 12px;
		}
		to {
			opacity: 1;
			translate: 0 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.plate {
			animation: none;
		}
	}

	.figure {
		position: relative;
		width: 100%;
		margin-bottom: 6px;
	}

	.plate :global(.preview-stage),
	.glyph {
		display: block;
		width: 100%;
		aspect-ratio: 1;
	}

	.glyph polyline {
		fill: none;
		stroke: var(--ink-sepia);
		stroke-width: 1.1;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.like-row {
		margin-top: 4px;
	}

	.plate-no {
		margin: 0;
		font-family: 'Cinzel', serif;
		font-size: 0.64rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--ink-sepia-45);
	}

	.spell-name {
		margin: 0;
		max-width: 100%;
		font-family: 'Cinzel', serif;
		font-weight: 600;
		font-size: 1.02rem;
		line-height: 1.25;
		color: var(--ink-sepia);
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
	}

	.spell-sub {
		display: flex;
		flex-wrap: wrap;
		gap: 3px 10px;
		align-items: baseline;
		justify-content: center;
		margin: 5px 0 0;
	}

	/* Element names read as a small inked stamp. Usernames stay exactly as typed. */
	.spell-element {
		padding: 1px 7px;
		border: 1px solid var(--ink-sepia-45);
		font-size: 0.66rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-sepia-70);
	}

	.inscribed {
		font-style: italic;
		font-size: 0.86rem;
		color: var(--muted-ink);
	}

	/* Actions are set in ink and stay quiet until the plate is attended. */
	.actions {
		display: flex;
		gap: 2px 18px;
		min-height: 26px;
		align-items: center;
		margin-top: 2px;
		opacity: 0;
		transition: opacity 200ms ease;
	}

	.plate:hover .actions,
	.plate:focus-within .actions {
		opacity: 1;
	}

	@media (hover: none) {
		.actions {
			opacity: 1;
		}
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
		border-bottom-color: var(--gold);
		color: var(--ink-sepia);
	}

	.ink-action:focus-visible {
		outline: 2px solid var(--gold);
		outline-offset: 2px;
	}
</style>
