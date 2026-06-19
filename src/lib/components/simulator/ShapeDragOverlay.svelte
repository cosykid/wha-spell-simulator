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
