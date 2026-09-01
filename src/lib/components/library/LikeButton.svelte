<!--
@component
The shared library's like control: a plain thumbs-up with its tally. Inked and
quiet while unpressed, inked solid once the reader has liked the spell.
-->
<script lang="ts">
	import type { LibrarySpell } from '$lib/structures/savedSpell.js';

	interface Props {
		spell: LibrarySpell;
		onLike: () => void;
	}

	let { spell, onLike }: Props = $props();
</script>

<button
	type="button"
	class="like"
	class:liked={spell.viewerUpvoted}
	data-testid="spell-upvote-button"
	aria-pressed={spell.viewerUpvoted}
	aria-label={spell.viewerUpvoted ? 'Remove your like' : 'Like this spell'}
	onclick={onLike}
>
	<svg class="thumb" viewBox="0 0 24 24" aria-hidden="true">
		<path
			d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"
		/>
	</svg>
	<span class="like-count">{spell.upvoteCount}</span>
</button>

<style>
	.like {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 0;
		padding: 2px 4px;
		border: 0;
		border-radius: 4px;
		background: none;
		box-shadow: none;
		color: var(--ink-sepia-70);
		transition: color 160ms ease;
	}

	.like:hover {
		background: none;
		color: var(--ink-sepia);
	}

	.like:active {
		transform: scale(0.94);
	}

	.like:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.thumb {
		width: 15px;
		height: 15px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linejoin: round;
	}

	.like-count {
		font-family: 'Cinzel', serif;
		font-size: 0.82rem;
		line-height: 1;
	}

	.like.liked {
		color: var(--accent);
	}

	.like.liked .thumb {
		fill: currentColor;
		stroke: none;
	}
</style>
