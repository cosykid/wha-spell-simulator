<!--
@component
Arcane zoom-out glyph: a magnifying glass with a minus. Authored to match the
filled woodcut weight of the sourced glyphs (game-icons has no plus/minus lens).
Filled, so it inherits the plate's icon styling (currentColor fill).
See CanvasIconButton.
-->
<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';

	let props: SVGAttributes<SVGSVGElement> = $props();
</script>

<svg {...props} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
	<path
		fill-rule="evenodd"
		d="M205 50a150 150 0 1 0 0 300 150 150 0 0 0 0-300zm0 38a112 112 0 1 1 0 224 112 112 0 0 1 0-224z"
	/>
	<path d="M320.6 284.4 289.4 315.6 444.4 470.6 475.6 439.4Z" />
	<path d="M128 180h154v40H128z" />
</svg>
