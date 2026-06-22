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
	/* The parent sets size and border; we only anchor the absolutely-placed chip. */
	button {
		position: relative;
		/* These bordered square buttons want more breathing room than the bare tools. */
		--label-offset: 9px;
	}

	/* Reveal the shared name chip (see HoverLabel) on hover or keyboard focus. */
	button:hover,
	button:focus-visible {
		--label-shown: 1;
	}
</style>
