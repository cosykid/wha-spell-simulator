<!--
@component
Cursor-following shape preview for drag placement.

The overlay renders the shape's normalized base strokes in the same 100x100
preview space used by dictionary and palette cards. It is fixed-positioned by
viewport coordinates so it can follow the pointer while the actual placement is
still being decided by the route-level drag handlers.
-->
<script lang="ts">
	import type { ShapeItem } from '$lib/types.js';
	import { strokeToPreviewPoints } from '$lib/ui/strokePreview.js';

	interface Props {
		preview: { item: ShapeItem; x: number; y: number };
	}

	let { preview }: Props = $props();
</script>

<div class="shape-drag-overlay" style="left: {preview.x}px; top: {preview.y}px;" aria-hidden="true">
	<svg viewBox="0 0 100 100" focusable="false">
		{#each preview.item.baseStrokes as stroke, strokeIndex (strokeIndex)}
			{@const points = strokeToPreviewPoints(stroke)}
			{#if points}
				<polyline {points}></polyline>
			{/if}
		{/each}
	</svg>
</div>

<style>
	/* Floating preview that follows the cursor while dragging a shape onto the
	   canvas. left/top are the pointer's viewport coordinates, so it is fixed and
	   centered on the cursor. Without these rules the inline SVG renders unbounded
	   and its polylines fall back to the default solid-black fill. */
	.shape-drag-overlay {
		position: fixed;
		z-index: 60;
		width: 72px;
		height: 72px;
		pointer-events: none;
		transform: translate(-50%, -50%);
		opacity: 0.9;
	}

	.shape-drag-overlay svg {
		display: block;
		width: 100%;
		height: 100%;
	}

	.shape-drag-overlay polyline {
		fill: none;
		stroke: var(--ink);
		stroke-width: 4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
