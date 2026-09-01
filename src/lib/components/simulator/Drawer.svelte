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

	// What counts as a Tab stop inside the panel, for the modal focus trap.
	const FOCUS_STOPS =
		'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !open) return;
		// A native dialog dismisses itself on Escape and the event still reaches the
		// window, so without this one keypress would take the dialog and the drawer
		// standing behind it at the same time.
		if (document.querySelector('dialog[open]')) return;
		event.stopPropagation();
		onClose();
	}

	/** A stop the browser will really move focus to: laid out, and not hidden. */
	function isReachable(stop: HTMLElement) {
		return stop.offsetParent !== null && getComputedStyle(stop).visibility !== 'hidden';
	}

	// A modal drawer covers the app, so Tab has to cycle inside it rather than walk
	// out into the canvas chrome under the backdrop. Non-modal drawers leave the
	// canvas reachable on purpose, so they are not trapped.
	function onPanelKeydown(event: KeyboardEvent) {
		if (!modal || !open || event.key !== 'Tab' || !panel) return;
		const stops = [...panel.querySelectorAll<HTMLElement>(FOCUS_STOPS)].filter(isReachable);
		if (stops.length === 0) return;
		const edge = event.shiftKey ? stops[0] : stops[stops.length - 1];
		const wrapTo = event.shiftKey ? stops[stops.length - 1] : stops[0];
		if (document.activeElement === edge || (event.shiftKey && document.activeElement === panel)) {
			event.preventDefault();
			wrapTo.focus();
		}
	}

	// Move focus into the panel as it opens so keyboard users land inside it, then
	// hand focus back to whatever opened the drawer once it closes.
	$effect(() => {
		if (!open) return;
		const opener = document.activeElement;
		panel?.focus();
		return () => {
			if (opener instanceof HTMLElement && opener !== document.body && opener.isConnected) {
				opener.focus();
			}
		};
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
	onkeydown={onPanelKeydown}
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
		/* Matched to the panel's own slide so the dim and the travel land together. */
		transition: opacity var(--dur-panel) var(--ease-out-panel);
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
		/* The body's side padding, published so a panel can cancel it: a panel whose
		   own scroll column reaches the drawer's edge puts its scrollbar there and
		   spends this as the gap between the bar and the content. */
		--drawer-pad-x: 18px;
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
		transition: transform var(--dur-panel) var(--ease-out-panel);
	}

	.drawer.left {
		left: 0;
		transform: translateX(-103%);
		border-top-right-radius: 18px;
		border-bottom-right-radius: 18px;
	}

	.drawer.right {
		right: 0;
		transform: translateX(103%);
		border-top-left-radius: 18px;
		border-bottom-left-radius: 18px;
	}

	.drawer.open {
		transform: translateX(0);
		pointer-events: auto;
	}

	/* The panel is focused programmatically on open so keyboard users land inside
	   it. It is tabindex="-1" (not Tab-reachable), so this managed focus is the only
	   way it lights up, and a ring on the whole container reads as stray highlight. */
	.drawer:focus {
		outline: none;
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
		width: 26px;
		height: 60px;
		min-height: 0;
		padding: 0;
		border: 0;
		color: var(--ink-sepia-45);
		background: var(--drawer-glass);
		-webkit-backdrop-filter: blur(var(--drawer-blur)) saturate(1.1);
		backdrop-filter: blur(var(--drawer-blur)) saturate(1.1);
		cursor: pointer;
		opacity: 0;
		transition:
			opacity var(--dur-fade) ease,
			color var(--dur-hover) ease,
			background var(--dur-hover) ease;
	}

	/* Overlap the panel edge by a hair to hide its border seam, round only the
	   outward corners, and lean on a soft ambient shadow (no hard offset) so the tab
	   reads as the panel's own material bulging out rather than a chip stuck on. */
	.drawer.right .drawer-close {
		right: 100%;
		border-radius: 18px 0 0 18px;
		box-shadow: -16px 0 28px -14px rgba(36, 27, 22, 0.3);
	}

	.drawer.left .drawer-close {
		left: 100%;
		border-radius: 0 18px 18px 0;
		box-shadow: 16px 0 28px -14px rgba(36, 27, 22, 0.3);
	}

	.drawer.open .drawer-close {
		opacity: 1;
		transition-delay: 120ms;
	}

	.drawer-close:hover {
		color: var(--ink-sepia);
		background: rgba(232, 222, 192, 0.92);
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
		/* Scrolling past the end of the drawer must not pan the canvas behind it. */
		overscroll-behavior: contain;
		scrollbar-width: thin;
		padding: 20px var(--drawer-pad-x);
	}

	/* Leave a sliver of canvas beside the panel so the close tab always has room to
	   extend into, even on the narrowest phones. */
	@media (max-width: 640px) {
		.drawer {
			width: min(440px, 90vw);
		}
	}
</style>
