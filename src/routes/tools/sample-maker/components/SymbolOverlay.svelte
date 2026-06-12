<!--
@component
A full-page view of the previewed reference glyph, opened by tapping the header thumbnail. Uses a
native <dialog> (Escape dismissal + dimmed backdrop for free); the `open` prop drives `showModal()`
/ `close()` through a small attachment, and `onclose` reports dismissals back to the caller.
-->
<script lang="ts">
	import { getSymbolSvg } from '$lib/dictionary/svgStrokes.js';
	import { getMakerSession } from '../maker-session.svelte.js';

	interface Props {
		/** Whether the overlay is shown — kept in sync with the dialog's modal state. */
		open: boolean;
		/** Called when the dialog is dismissed (Escape, backdrop, or the Close button). */
		onclose: () => void;
	}

	let { open, onclose }: Props = $props();

	let dialog: HTMLDialogElement | undefined = $state();
	$effect(() => {
		if (open) dialog?.showModal();
		else dialog?.close();
	});

	const session = getMakerSession();
</script>

<!-- {#if open} -->
<dialog bind:this={dialog} class="symbol-overlay" {onclose}>
	{#if session.picker.current}
		<span
			class="big-thumb"
			style="transform: rotate({session.rotationDeg}deg) scale({session.previewScale})"
		>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html getSymbolSvg(session.picker.current.id)}
		</span>
		<span class="overlay-name">{session.picker.current.displayName}</span>
	{/if}
	<button type="button" class="overlay-close" onclick={onclose}>Close</button>
</dialog>

<!-- {/if} -->

<style>
	.symbol-overlay {
		width: min(560px, 92vw);
		max-height: 92vh;
		padding: 24px;
		border: 1px solid rgba(31, 111, 115, 0.4);
		border-radius: 12px;
		color: var(--ink);
		background: var(--paper, #f2eccd);
		box-shadow: 0 24px 60px rgba(36, 27, 22, 0.45);
	}

	.symbol-overlay::backdrop {
		background: rgba(36, 27, 22, 0.6);
	}

	.symbol-overlay[open] {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
	}

	.big-thumb {
		display: flex;
		align-items: center;
		justify-content: center;
		width: min(70vw, 360px);
		height: min(70vw, 360px);
	}

	.big-thumb :global(svg) {
		width: 100%;
		height: 100%;
		overflow: visible;
	}

	.overlay-name {
		font-family: 'Cinzel', serif;
		font-size: 22px;
		font-weight: 600;
	}

	.overlay-close {
		min-height: 40px;
		padding: 0 20px;
	}
</style>
