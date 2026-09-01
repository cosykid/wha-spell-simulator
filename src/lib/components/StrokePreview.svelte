<!--
@component
The square thumbnail that fronts a reference card: a glyph's stroke template
drawn as polylines on the normalized preview viewBox. Renders nothing when the
entry carries no template, which is what leaves its card without a thumbnail
column.
-->
<script lang="ts">
	import type { Point } from '$lib/types.js';
	import { strokesToPreviewPolylines } from '$lib/ui/strokePreview.js';

	interface Props {
		strokes?: Point[][];
	}

	let { strokes }: Props = $props();

	const polylines = $derived(strokesToPreviewPolylines(strokes));
</script>

{#if polylines.length}
	<div class="reference-preview" aria-hidden="true">
		<svg viewBox="0 0 100 100" role="img" focusable="false">
			{#each polylines as points (points)}
				<polyline {points}></polyline>
			{/each}
		</svg>
	</div>
{/if}
