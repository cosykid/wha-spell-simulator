<!--
@component
A sliver of drawer parchment tucked just inside the ornate frame, so the left
edge admits there is a surface behind it before anything is clicked.

It widens while the menu trigger is hovered, so the drawer hints at itself
before it is opened.
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
		width: 5px;
		background: linear-gradient(to right, var(--drawer-glass), rgba(237, 228, 202, 0));
		box-shadow:
			inset -1px 0 0 var(--ink-sepia-20),
			2px 0 6px rgba(36, 27, 22, 0.14);
		pointer-events: none;
		transition: width var(--dur-hover) var(--ease-out-soft);
	}

	.drawer-peek.hinted {
		width: 9px;
	}

	@media (prefers-reduced-motion: reduce) {
		.drawer-peek {
			transition: none;
		}
	}
</style>
