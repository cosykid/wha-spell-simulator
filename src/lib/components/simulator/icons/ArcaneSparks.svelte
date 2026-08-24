<!--
@component
Arcane sparks glyph: one large four-pointed spark with two smaller ones trailing
it, for the control that chooses which engine performs a cast. Authored in-house
to match the filled woodcut weight of the sourced glyphs. Filled, so it inherits
the plate's icon styling (currentColor fill). See CanvasIconButton.
-->
<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<svg {...props} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
	<path
		d="M200 50c12 90 60 138 150 150-90 12-138 60-150 150-12-90-60-138-150-150 90-12 138-60 150-150z"
	/>
	<path d="M390 40c6 42 28 64 70 70-42 6-64 28-70 70-6-42-28-64-70-70 42-6 64-28 70-70z" />
	<path d="M380 320c5 35 25 55 60 60-35 5-55 25-60 60-5-35-25-55-60-60 35-5 55-25 60-60z" />
</svg>
