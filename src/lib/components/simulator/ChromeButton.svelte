<!--
@component
The one control every piece of canvas chrome is made of.

What a button *does* is `role`, and only that: `command` fires once, `mode` stays
on until you turn it off, `opener` reveals a drawer. All three wear the same
chassis, so a row of them reads as one material rather than as three kinds of
widget. The one that is currently on is underscored in ink: a mode left running,
a drawer left standing open.

The chassis itself is nothing at all. These sit directly on the parchment and
only take a faint glass wash on hover, so the chrome reads as marks on the page
rather than as boxes over it.

`showLabel` puts the name on the button, and then there is no hover chip: a
control that already says what it is does not need to say it twice. Without it
the name lives in the chip, aligned to its run's edge by `chipAlign`.

  <ChromeButton role="mode" name="Pen" icon={PenTool} active={mode === 'draw'} onclick={selectDraw} />
-->
<script lang="ts">
	import type { ComponentType } from 'svelte';
	import HoverLabel from './HoverLabel.svelte';

	interface Props {
		label: string;
		/** A lucide line icon. Filled glyphs do not read on a stroke-drawn chassis. */
		icon: ComponentType;
		role: 'command' | 'mode' | 'opener';
		/** Keyboard chord shown in the hover chip, already platform-formatted. */
		shortcut?: string;
		/** Modes and openers are on or off; a command never is. */
		active?: boolean;
		disabled?: boolean;
		showLabel?: boolean;
		labelPlacement?: 'above' | 'below';
		chipAlign?: 'center' | 'left' | 'right';
		id?: string;
		testId?: string;
		onclick: () => void;
	}

	let {
		label,
		icon: Icon,
		role,
		shortcut,
		active = false,
		disabled = false,
		showLabel = false,
		labelPlacement = 'above',
		chipAlign = 'center',
		id,
		testId,
		onclick
	}: Props = $props();
</script>

<button
	type="button"
	{id}
	data-testid={testId}
	class="chrome-btn role-{role}"
	class:is-on={active}
	class:has-label={showLabel}
	aria-label={label}
	aria-pressed={role === 'command' ? undefined : active}
	{disabled}
	{onclick}
>
	<Icon class="btn-icon" aria-hidden="true" />
	{#if showLabel}<span class="btn-label">{label}</span>{/if}
	<!-- Shown for disabled buttons too: a greyed Undo still has to say what it is.
	     The chip is driven by a CSS variable on :hover, which keeps matching while
	     the button stays non-interactive. Its caret centres on the button's own
	     box, which is where the icon of an icon-only control sits. -->
	{#if !showLabel}
		<HoverLabel {label} {shortcut} placement={labelPlacement} caret="center" chip={chipAlign} />
	{/if}
</button>

<style>
	.chrome-btn {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: flex-start;
		gap: 8px;
		/* Outer size is --chrome-control-{width,height}; a ChromeRule spans the
		   same, which is what puts a divider's ink on the run's centre line. */
		min-height: var(--chrome-control-height);
		padding: var(--chrome-control-pad-y) 9px;
		border: 1px solid transparent;
		border-radius: 9px;
		color: var(--ink-chrome);
		background: transparent;
		/*
		 * base.css gives every button a white inset top highlight, which suits the
		 * app's raised parchment buttons. On a stacked column of flat chrome it
		 * reads as a hairline above every control, so it is reset here.
		 */
		box-shadow: none;
		cursor: pointer;
		transition:
			color var(--dur-hover) ease,
			background var(--dur-hover) ease,
			border-color var(--dur-hover) ease;
	}

	.chrome-btn:hover:not(:disabled) {
		color: var(--ink-sepia);
		background: var(--chrome-glass);
		border-color: var(--ink-sepia-20);
	}

	.chrome-btn:active:not(:disabled) {
		transform: translateY(1px);
	}

	.chrome-btn:disabled {
		opacity: 0.26;
		cursor: not-allowed;
	}

	/*
	 * On is a stroke under the mark, short and thick and sat directly beneath the
	 * icon. A full-width hairline would read as another group divider, which is
	 * the one thing this must not look like.
	 */
	.chrome-btn.is-on {
		color: var(--ink-sepia);
	}

	.chrome-btn.is-on::after {
		content: '';
		position: absolute;
		left: 9px;
		bottom: 1px;
		width: 20px;
		height: 2.5px;
		border-radius: 2px;
		background: var(--ink-sepia);
	}

	/* The icons are parent-provided lucide glyphs, so reach across the scope
	   boundary to size and stroke them. */
	.chrome-btn :global(.btn-icon) {
		display: block;
		flex: 0 0 auto;
		width: 20px;
		height: 20px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.75;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.btn-label {
		font-size: 13px;
		white-space: nowrap;
	}

	/* Reveal the shared name chip (see HoverLabel) on hover or keyboard focus.
	   These sit in runs of three or four, so the chip waits out a short intent
	   delay and a sweep along the column names none of the buttons it passes. */
	.chrome-btn:hover,
	.chrome-btn:focus-visible {
		--label-shown: 1;
		--label-delay: 350ms;
	}
</style>
