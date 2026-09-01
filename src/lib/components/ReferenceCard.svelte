<!--
@component
One sigil or sign in the dictionary: a stroke thumbnail, the name, an optional
element tag, and the source note clamped to two lines behind a "Show more"
toggle. The card measures its own note, so nothing outside it has to know which
notes overflow. Whether a note is open is the list's to remember, so that it
survives a trip through another tab.
-->
<script lang="ts">
	import StrokePreview from './StrokePreview.svelte';
	import type { Point } from '$lib/types.js';

	interface Props {
		name: string;
		strokes?: Point[][];
		/** The element, when it says something the name does not. */
		tag?: string | null;
		note?: string;
		expanded?: boolean;
		onToggle?: () => void;
	}

	let { name, strokes, tag = null, note, expanded = false, onToggle }: Props = $props();

	let noteElement = $state<HTMLElement | null>(null);
	let truncated = $state(false);

	/** Whether the clamp is hiding anything. Meaningless while the note is open. */
	function measure() {
		if (!noteElement || expanded || noteElement.clientHeight === 0) return;
		truncated = noteElement.scrollHeight > noteElement.clientHeight + 1;
	}

	// The clamp can only be read off a laid-out card, and what it hides is
	// width-driven, so the answer is taken once the DOM settles, again on the next
	// frame for a card that mounts before it has a size, and on every resize.
	$effect(() => {
		void expanded;
		measure();
		const frame = requestAnimationFrame(measure);
		window.addEventListener('resize', measure);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener('resize', measure);
		};
	});
</script>

<article class="reference-card {strokes?.length ? 'has-template' : ''}">
	<StrokePreview {strokes} />
	<div class="reference-card-body">
		<div class="reference-card-header">
			<strong>{name}</strong>
			{#if tag}<span>{tag}</span>{/if}
		</div>
		{#if note}
			<p class="reference-note" class:clamped={!expanded} bind:this={noteElement}>{note}</p>
			<button
				type="button"
				class="reference-note-toggle"
				class:reserved={!truncated && !expanded}
				aria-expanded={expanded}
				onclick={onToggle}
			>
				<span>{expanded ? 'Show less' : 'Show more'}</span>
				<svg
					class="reference-note-chevron"
					viewBox="0 0 16 16"
					aria-hidden="true"
					focusable="false"
				>
					<polyline points="4,6 8,10 12,6"></polyline>
				</svg>
			</button>
		{/if}
	</div>
</article>

<style>
	.reference-note {
		margin: 0;
		color: var(--muted-ink);
		font-size: 12px;
		line-height: 1.4;
	}

	/* Collapsed notes fill at most two lines (with an ellipsis) so a card is never
	   taller than its stroke thumbnail until the note is expanded. */
	.reference-note.clamped {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
	}

	.reference-note-toggle {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-top: 6px;
		min-height: 0;
		padding: 0;
		border: none;
		background: none;
		box-shadow: none;
		cursor: pointer;
		color: var(--muted-ink);
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		line-height: 1.35;
		transition: color var(--dur-hover) ease;
	}

	/*
	 * The row is always in the layout and merely hides itself until the note turns
	 * out to overflow. Inserting it a frame later would shove the whole list down.
	 * `visibility` also keeps the hidden row out of hit testing and the a11y tree.
	 * An open note always shows it: it plainly had more to say.
	 */
	.reference-note-toggle.reserved {
		visibility: hidden;
	}

	.reference-note-toggle:hover,
	.reference-note-toggle:active,
	.reference-note-toggle:focus-visible {
		color: var(--ink);
		background: none;
	}

	/* Underline only on hover/focus. The label itself stays plain. */
	.reference-note-toggle:hover span,
	.reference-note-toggle:focus-visible span {
		text-decoration: underline;
	}

	.reference-note-chevron {
		width: 14px;
		height: 14px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
		transition: transform var(--dur-quick) ease;
	}

	.reference-note-toggle[aria-expanded='true'] .reference-note-chevron {
		transform: rotate(180deg);
	}
</style>
