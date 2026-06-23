<!--
@component
Icon-only button primitive for simulator controls.

This component centralizes the repeated simulator button wiring: labels, the hover
name chip, pressed/active state, disabled state, test ids, and icon content. The
parent still chooses the visual button class so action buttons, tool buttons, and
zoom buttons can share behavior without sharing layout assumptions.

`labelPlacement` floats the hover chip above (bottom-corner controls) or below
(top-corner controls) the button. `chipAlign` shifts the chip box toward an edge
for a button in a screen corner so the box stays on-screen (the caret stays centred
on the icon either way).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import HoverLabel from './HoverLabel.svelte';

	interface Props {
		id?: string;
		testId?: string;
		label: string;
		tooltip?: string;
		buttonClass?: string;
		labelPlacement?: 'above' | 'below';
		chipAlign?: 'center' | 'left' | 'right';
		active?: boolean;
		pressed?: boolean;
		disabled?: boolean;
		onclick: () => void;
		children: Snippet;
	}

	let {
		id,
		testId,
		label,
		tooltip = label,
		buttonClass = '',
		labelPlacement = 'above',
		chipAlign = 'center',
		active = false,
		pressed,
		disabled = false,
		onclick,
		children
	}: Props = $props();
</script>

<button
	type="button"
	{id}
	data-testid={testId}
	class={buttonClass}
	class:active
	aria-pressed={pressed}
	aria-label={label}
	{disabled}
	{onclick}
>
	{@render children()}
	{#if !disabled}
		<HoverLabel label={tooltip} placement={labelPlacement} chip={chipAlign} />
	{/if}
</button>

<style>
	/*
	 * Squared brass plate: a dark ink fill inside a faint brass border, with an
	 * inner frame box (::before) and brass corner braces joining the two frames at
	 * each corner (see the --chrome-btn-* tokens). Every consumer of this primitive
	 * (action bar, menu, zoom) wants this exact look, so it lives here rather than
	 * being re-declared per cluster. Parents own only layout (where it sits, gaps).
	 */
	button {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		min-height: 32px;
		padding: 0;
		border: 1px solid var(--chrome-btn-border);
		border-radius: var(--chrome-btn-radius);
		color: var(--chrome-btn-fg);
		background: var(--chrome-btn-corners), var(--chrome-btn-bg);
		box-shadow: var(--chrome-btn-bezel);
		transition:
			color 160ms ease,
			background 160ms ease,
			border-color 160ms ease;
		/* These bordered square buttons want more breathing room than the bare tools. */
		--label-offset: 9px;
	}

	/* Inner frame box: a second brass rule inset by --chrome-btn-inset; the corner
	   braces from the token run from the outer border to this box's corners. */
	button::before {
		content: '';
		position: absolute;
		inset: var(--chrome-btn-inset);
		border: 1px solid var(--chrome-btn-gold);
		pointer-events: none;
	}

	button:hover:not(:disabled) {
		background: var(--chrome-btn-corners), var(--chrome-btn-bg-hover);
	}

	button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* The icon is parent-provided (a filled game-icons glyph), so reach across the
	   scope boundary to size it and fill it with the plate's pale ink. */
	button :global(svg) {
		position: relative;
		width: 15px;
		height: 15px;
		display: block;
		fill: currentColor;
		stroke: none;
	}

	/* Reveal the shared name chip (see HoverLabel) on hover or keyboard focus. */
	button:hover,
	button:focus-visible {
		--label-shown: 1;
	}

	@media (prefers-reduced-motion: reduce) {
		button {
			transition: none;
		}
	}
</style>
