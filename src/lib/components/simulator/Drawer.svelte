<!--
@component
Reusable slide-out drawer. A frosted-parchment panel that slides in from a screen
edge and reads as a translucent shadow over the canvas, not a blocky panel.

`modal` drawers dim and close on a backdrop click (the left menu). Non-modal
drawers leave the canvas fully interactive and close only via Esc, their trigger,
or the close button (the right reference palette, which you keep open while
placing shapes).

<Drawer side="left" {open} label="Menu" modal onClose={close}>…</Drawer>
-->
<script lang="ts">
	import X from 'lucide-svelte/icons/x';
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
		<X aria-hidden="true" />
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
		padding: 20px 18px;
		color: var(--ink-sepia);
		background: var(--drawer-glass);
		-webkit-backdrop-filter: blur(var(--drawer-blur)) saturate(1.1);
		backdrop-filter: blur(var(--drawer-blur)) saturate(1.1);
		box-shadow: var(--drawer-shadow);
		pointer-events: none;
		transition:
			transform 340ms cubic-bezier(0.22, 1, 0.36, 1),
			opacity 240ms ease;
		overflow-y: auto;
		scrollbar-width: thin;
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

	.drawer-close {
		position: absolute;
		top: 12px;
		right: 12px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		min-height: 32px;
		padding: 0;
		border: 0;
		border-radius: 8px;
		color: var(--ink-sepia-70);
		background: transparent;
		box-shadow: none;
	}

	.drawer-close:hover {
		color: var(--ink-sepia);
		background: var(--chrome-glass);
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
	}

	@media (max-width: 640px) {
		.drawer {
			width: min(460px, 100vw);
			border-radius: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.drawer,
		.drawer-backdrop {
			transition: none;
		}
	}
</style>
