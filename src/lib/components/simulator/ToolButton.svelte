<!--
@component
A single floating canvas tool: a bare line icon paired with a diamond state pip
(filled when the tool is active, outline when idle). It sits directly on the
parchment and only reveals a faint translucent glass on hover/active, so the
chrome reads as a soft shadow rather than a button box.

Hovering or focusing the tool reveals a parchment-ink name label with a small
caret, floating above the icon in place of the plain browser tooltip.

Pass the icon as children. Set `pipFirst` so the pip faces the canvas centre
(used by the right-hand dock); the label anchors to that same edge so it never
spills off-screen.

<ToolButton label="Pen" active={mode === 'draw'} onclick={selectDraw}>
  <PenTool aria-hidden="true" />
</ToolButton>
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import HoverLabel from './HoverLabel.svelte';

	interface Props {
		label: string;
		shortcut?: string;
		active?: boolean;
		disabled?: boolean;
		pipFirst?: boolean;
		labelBelow?: boolean;
		id?: string;
		testId?: string;
		onclick: () => void;
		children: Snippet;
	}

	let {
		label,
		shortcut,
		active = false,
		disabled = false,
		pipFirst = false,
		labelBelow = false,
		id,
		testId,
		onclick,
		children
	}: Props = $props();
</script>

<button
	type="button"
	class="tool-button"
	class:active
	class:pip-first={pipFirst}
	{id}
	data-testid={testId}
	aria-label={label}
	aria-pressed={active}
	{disabled}
	{onclick}
>
	<span class="tool-icon">{@render children()}</span>
	<span class="tool-pip" aria-hidden="true"></span>
	<HoverLabel
		{label}
		{shortcut}
		placement={labelBelow ? 'below' : 'above'}
		caret={pipFirst ? 'right' : 'left'}
		chip={pipFirst ? 'right' : 'left'}
	/>
</button>

<style>
	.tool-button {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 34px;
		padding: 5px 7px;
		border: 0;
		border-radius: 9px;
		color: var(--ink-sepia-70);
		background: transparent;
		box-shadow: none;
		cursor: pointer;
		transition:
			color var(--dur-hover) ease,
			background var(--dur-hover) ease;
	}

	.tool-button.pip-first {
		flex-direction: row-reverse;
	}

	.tool-button:hover {
		color: var(--ink-sepia);
		background: var(--chrome-glass);
	}

	.tool-button.active {
		color: var(--ink-sepia);
		background: var(--chrome-glass);
	}

	.tool-button:active {
		transform: translateY(1px);
	}

	.tool-button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.tool-icon {
		display: inline-flex;
	}

	.tool-icon :global(svg) {
		width: 18px;
		height: 18px;
		display: block;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.9;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	/* The diamond pip: outline when idle, ink-filled when the tool is active. */
	.tool-pip {
		width: 6px;
		height: 6px;
		flex: 0 0 auto;
		transform: rotate(45deg);
		border: 1.6px solid var(--ink-sepia-45);
		background: transparent;
		transition:
			background var(--dur-hover) ease,
			border-color var(--dur-hover) ease;
	}

	.tool-button.active .tool-pip {
		border-color: var(--ink-sepia);
		background: var(--ink-sepia);
	}

	/* Reveal the shared name chip (see HoverLabel) on hover or keyboard focus. The
	   dock stacks four of these, so the chip waits out a short intent delay and a
	   sweep down the column names none of the buttons it passes. */
	.tool-button:hover,
	.tool-button:focus-visible {
		--label-shown: 1;
		--label-delay: 350ms;
	}
</style>
