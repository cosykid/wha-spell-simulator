<!--
@component
A hover/focus name chip for an icon-only canvas control: a sharp sepia box with a
small detached triangle that points at the icon. Drop it inside a button that sets
`--label-shown: 1` on `:hover` / `:focus-visible` (see ChromeButton);
that one property fades and eases both the box and the caret in together.

The caret and the box are anchored independently so each lands where it should:
`caret` points the triangle at the icon, while `chip` shifts the box to whichever
side keeps it on-screen for the edge- and corner-hugging docks.

  <HoverLabel label="Menu" placement="below" chip="left" />
-->
<script lang="ts">
	interface Props {
		label: string;
		placement?: 'above' | 'below';
		caret?: 'center' | 'left' | 'right';
		chip?: 'center' | 'left' | 'right';
		shortcut?: string;
	}

	let { label, placement = 'above', caret = 'center', chip = 'center', shortcut }: Props = $props();
</script>

<span class="hover-box {placement} chip-{chip}" aria-hidden="true">
	{label}{#if shortcut}<kbd class="hover-key">{shortcut}</kbd>{/if}
</span>
<span class="hover-caret {placement} caret-{caret}" aria-hidden="true"></span>

<style>
	/*
	 * Both pieces read `--label-shown` (0 hidden, 1 shown), inherited from the
	 * button. Opacity fades with it and the box eases up the last few pixels, so a
	 * single property on the parent drives the whole reveal.
	 *
	 * `--label-delay` is the hover-intent wait, and the button only sets it while
	 * hovered. So arriving waits it out and a sweep across a dock never strobes,
	 * while leaving reads 0 and the label goes at once.
	 */
	.hover-box,
	.hover-caret {
		position: absolute;
		z-index: 1;
		pointer-events: none;
		opacity: var(--label-shown, 0);
		transition:
			opacity var(--dur-quick) ease,
			transform var(--dur-quick) ease;
		transition-delay: var(--label-delay, 0ms);
	}

	.hover-box {
		--tx: -50%;
		padding: 3px 20px;
		color: var(--panel);
		background: var(--ink-sepia);
		box-shadow: 0 6px 18px rgba(36, 27, 22, 0.28);
		font-family: 'IM Fell English', serif;
		font-size: 14px;
		line-height: 1.2;
		text-align: center;
		white-space: nowrap;
		transform: translateX(var(--tx)) translateY(calc((1 - var(--label-shown, 0)) * 3px));
	}

	/* The shortcut key, shown as a faint outlined cap after the name. */
	.hover-key {
		margin-left: 8px;
		padding: 0 5px;
		border: 1px solid rgba(242, 236, 214, 0.45);
		border-radius: 3px;
		font-family: inherit;
		font-size: 11px;
		line-height: 1.5;
		text-transform: uppercase;
		opacity: 0.85;
	}

	/*
	 * Vertical placement: the box clears the button, the caret tucks into the gap.
	 * `--label-offset` is the button-to-caret gap; the box sits a caret-height past
	 * it. Consumers raise the offset to push the whole popup further off the button.
	 */
	.hover-box.above {
		bottom: calc(100% + var(--label-offset, 2px) + 9px);
	}
	.hover-box.below {
		top: calc(100% + var(--label-offset, 2px) + 9px);
	}

	/* Horizontal box anchor: centred, or pinned to one edge to stay on-screen. */
	.hover-box.chip-center {
		left: 50%;
	}
	.hover-box.chip-left {
		--tx: 0;
		left: 4px;
	}
	.hover-box.chip-right {
		--tx: 0;
		right: 4px;
	}

	/* Caret: a standalone triangle in the gap, tip pointing at the icon. */
	.hover-caret {
		width: 0;
		height: 0;
		border-left: 6px solid transparent;
		border-right: 6px solid transparent;
	}

	.hover-caret.above {
		bottom: calc(100% + var(--label-offset, 2px));
		border-top: 7px solid var(--ink-sepia);
	}
	.hover-caret.below {
		top: calc(100% + var(--label-offset, 2px));
		border-bottom: 7px solid var(--ink-sepia);
	}

	/* Horizontal caret target: button centre, or ~18px in from one edge (the icon). */
	.hover-caret.caret-center {
		left: 50%;
		margin-left: -6px;
	}
	.hover-caret.caret-left {
		left: 12px;
	}
	.hover-caret.caret-right {
		right: 12px;
	}

	/*
	 * A cross fade is not motion, so the chip keeps its fade where the global guard
	 * in base.css turns everything else instant. Overriding that guard takes the
	 * same !important it uses. What does go is the few-pixel rise.
	 */
	@media (prefers-reduced-motion: reduce) {
		.hover-box,
		.hover-caret {
			transition-duration: var(--dur-quick) !important;
		}
		.hover-box {
			transform: translateX(var(--tx));
		}
	}
</style>
