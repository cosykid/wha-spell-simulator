<!--
@component
A sliver of drawer parchment tucked just inside the ornate frame, so the menu
trigger can show what is waiting behind the left edge before it is clicked.

It only exists while the trigger is under the pointer. Left standing, it reads
as a stray border down the side of the page rather than as part of the drawer.
-->
<script lang="ts">
	interface Props {
		/** True while the pointer is on the menu trigger. */
		hinted?: boolean;
	}

	let { hinted = false }: Props = $props();
</script>

<div class="drawer-peek" class:hinted aria-hidden="true"></div>

<style>
	.drawer-peek {
		position: absolute;
		top: 0;
		bottom: 0;
		left: var(--frame-width);
		z-index: 4;
		width: 9px;
		background: linear-gradient(to right, var(--drawer-glass), rgba(237, 228, 202, 0));
		box-shadow:
			inset -1px 0 0 var(--ink-sepia-20),
			2px 0 6px rgba(36, 27, 22, 0.14);
		opacity: 0;
		pointer-events: none;
		transition: opacity var(--dur-hover) var(--ease-out-soft);
	}

	.drawer-peek.hinted {
		opacity: 1;
	}

	@media (prefers-reduced-motion: reduce) {
		.drawer-peek {
			transition: none;
		}
	}
</style>
