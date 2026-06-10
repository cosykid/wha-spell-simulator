<!--
@component
One stored sample rendered as inline SVG in its canvas backing-store frame: the
contributor's raw ink plus (optionally) the reference glyph where the label placed
it — the same picture the Sample Maker showed at submission time. Stroke widths are
screen pixels (`non-scaling-stroke`), so thumbnails stay legible at any size.
-->
<script lang="ts">
	import type { LabelledSample } from '$lib/structures/labelledSample.js';
	import { referenceOverlay, strokePathD } from './renderSample.js';

	interface Props {
		sample: LabelledSample;
		/** Whether to draw the label's reference glyph on top of the ink. */
		showOverlay?: boolean;
		/** On-screen px width of the ink strokes. */
		inkWidth?: number;
		/** On-screen px width of the reference overlay. */
		overlayWidth?: number;
	}

	let { sample, showOverlay = true, inkWidth = 2, overlayWidth = 1.6 }: Props = $props();

	const overlay = $derived(referenceOverlay(sample));
</script>

<svg
	viewBox="0 0 {sample.meta.canvasWidth} {sample.meta.canvasHeight}"
	preserveAspectRatio="xMidYMid meet"
	role="img"
	aria-label="Sample {sample.id}"
>
	<rect
		class="paper"
		x="0"
		y="0"
		width={sample.meta.canvasWidth}
		height={sample.meta.canvasHeight}
	/>
	{#each sample.data as stroke, index (index)}
		<path
			class="ink"
			d={strokePathD(stroke)}
			stroke-width={inkWidth}
			vector-effect="non-scaling-stroke"
		/>
	{/each}
	{#if showOverlay && overlay}
		<path
			class="overlay"
			d={overlay.d}
			transform={overlay.transform}
			stroke-width={overlayWidth}
			vector-effect="non-scaling-stroke"
		/>
	{/if}
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: 100%;
	}

	.paper {
		fill: #fffdf4;
		stroke: rgba(36, 27, 22, 0.14);
	}

	path {
		fill: none;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.ink {
		stroke: var(--ink);
	}

	/* Same hue as the Sample Maker's symbol entity; multiply turns the overlay
	   near-black where it crosses the ink, making misalignment easy to spot. */
	.overlay {
		stroke: #d068f0;
		opacity: 0.85;
		mix-blend-mode: multiply;
	}
</style>
