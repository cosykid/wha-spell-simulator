<!--
@component
Reusable slide-out drawer. A frosted-parchment panel that slides in from a screen
edge and reads as a translucent shadow over the canvas, not a blocky panel.

`modal` drawers dim and close on a backdrop click (the left menu). Non-modal
drawers leave the canvas fully interactive and close only via Esc, their trigger,
or the close handle (the right reference palette, which you keep open while
placing shapes).

The close affordance is a tall "pull tab" centred on the panel's inner edge (the
one facing the canvas), so it sits near the cursor wherever you are working
instead of forcing a trip to a far corner.

<Drawer side="left" {open} label="Menu" modal onClose={close}>…</Drawer>
-->
<script lang="ts">
	import ChevronLeft from 'lucide-svelte/icons/chevron-left';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import type { Snippet } from 'svelte';

	interface Props {
		side: 'left' | 'right';
		open: boolean;
		label: string;
		modal?: boolean;
		onClose: () => void;
		children: Snippet;
	}

	let { side, open, label, modal = false, onClose, children }: Props = $props();

	let panel = $state<HTMLElement | null>(null);

	// Chevron points the way the panel slides to close: out toward its own edge.
	let CloseIcon = $derived(side === 'right' ? ChevronRight : ChevronLeft);

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			event.stopPropagation();
			onClose();
		}
	}

	// Move focus into the panel as it opens so keyboard users land inside it.
	$effect(() => {
		if (open) {
			panel?.focus();
		}
	});
</script>

<svelte:window onkeydown={onKeydown} />

{#if modal}
	<div class="drawer-backdrop" class:open onclick={onClose} aria-hidden="true"></div>
{/if}

<div
	bind:this={panel}
	class="drawer {side}"
	class:open
	role="dialog"
	aria-label={label}
	aria-hidden={!open}
	inert={!open}
	tabindex="-1"
>
	<button type="button" class="drawer-close" aria-label="Close {label}" onclick={onClose}>
		<CloseIcon aria-hidden="true" />
	</button>
	<div class="drawer-body">
		{@render children()}
	</div>
</div>

<style>
	.drawer-backdrop {
		position: absolute;
		inset: 0;
		z-index: 35;
		background: rgba(36, 27, 22, 0.26);
		opacity: 0;
		pointer-events: none;
		transition: opacity 320ms ease;
	}

	.drawer-backdrop.open {
		opacity: 1;
		pointer-events: auto;
	}

	.drawer {
		position: absolute;
		top: 0;
		bottom: 0;
		z-index: 40;
		width: min(380px, 86vw);
		display: flex;
		flex-direction: column;
		color: var(--ink-sepia);
		background: var(--drawer-glass);
		-webkit-backdrop-filter: blur(var(--drawer-blur)) saturate(1.1);
		backdrop-filter: blur(var(--drawer-blur)) saturate(1.1);
		box-shadow: var(--drawer-shadow);
		pointer-events: none;
		/* Visible so the close tab can extend past the inner edge onto the canvas.
		   The body, not the panel, is the scroll container (see .drawer-body). */
		overflow: visible;
		transition:
			transform 340ms cubic-bezier(0.22, 1, 0.36, 1),
			opacity 240ms ease;
	}

	.drawer.left {
		left: 0;
		transform: translateX(-103%);
		border-right: 1px solid rgba(255, 250, 230, 0.16);
		border-top-right-radius: 18px;
		border-bottom-right-radius: 18px;
	}

	.drawer.right {
		right: 0;
		transform: translateX(103%);
		border-left: 1px solid rgba(255, 250, 230, 0.16);
		border-top-left-radius: 18px;
		border-bottom-left-radius: 18px;
	}

	.drawer.open {
		transform: translateX(0);
		pointer-events: auto;
	}

	/*
	 * Close tab that extends out from the panel's inner edge (the one facing the
	 * canvas) so it claims no space inside the drawer. Centred vertically so it sits
	 * near the cursor wherever you are working. Hidden until the drawer opens so it
	 * never peeks while the panel is parked off-screen.
	 */
	.drawer-close {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		z-index: 2;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 56px;
		min-height: 0;
		padding: 0;
		border: 1px solid rgba(255, 250, 230, 0.16);
		color: var(--ink-sepia-45);
		background: var(--drawer-glass);
		-webkit-backdrop-filter: blur(var(--drawer-blur)) saturate(1.1);
		backdrop-filter: blur(var(--drawer-blur)) saturate(1.1);
		cursor: pointer;
		opacity: 0;
		transition:
			opacity 200ms ease,
			color 160ms ease,
			background 160ms ease;
	}

	/* Overlap the panel edge by a hair to hide its border seam, round only the
	   outward corners, and lean on a soft ambient shadow (no hard offset) so the tab
	   reads as the panel's own material bulging out rather than a chip stuck on. */
	.drawer.right .drawer-close {
		right: calc(100% - 1px);
		border-right: 0;
		border-radius: 14px 0 0 14px;
		box-shadow: -16px 0 28px -14px rgba(36, 27, 22, 0.3);
	}

	.drawer.left .drawer-close {
		left: calc(100% - 1px);
		border-left: 0;
		border-radius: 0 14px 14px 0;
		box-shadow: 16px 0 28px -14px rgba(36, 27, 22, 0.3);
	}

	.drawer.open .drawer-close {
		opacity: 1;
		transition-delay: 120ms;
	}

	.drawer-close:hover {
		color: var(--ink-sepia);
		background: var(--chrome-glass-strong);
	}

	.drawer-close :global(svg) {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.drawer-body {
		display: flex;
		flex-direction: column;
		min-height: 0;
		flex: 1 1 auto;
		overflow-y: auto;
		scrollbar-width: thin;
		padding: 20px 18px;
	}

	/* Leave a sliver of canvas beside the panel so the close tab always has room to
	   extend into, even on the narrowest phones. */
	@media (max-width: 640px) {
		.drawer {
			width: min(440px, 90vw);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.drawer,
		.drawer-backdrop {
			transition: none;
		}
	}
</style>
