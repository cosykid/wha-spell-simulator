<!--
@component
The header's small reference-glyph thumbnail: the previewed sign's SVG rotated to its suggested
orientation. Tapping it opens the full-page {@link SymbolOverlay}. Renders nothing until a sign is
previewed.
-->
<script lang="ts">
	import { getSymbolSvg } from '$lib/dictionary/svgStrokes.js';
	import { getMakerSession } from '../maker-session.svelte.js';

	const session = getMakerSession();
</script>

{#if session.picker.current}
	<button
		type="button"
		class="thumb-button"
		aria-label="View {session.picker.current.displayName} full screen"
		onclick={() => (session.symbolOverlayOpen = true)}
	>
		<!-- Rotated to the suggested angle; positive degrees turn clockwise, matching the canvas. -->
		<span class="thumb" style="transform: rotate({session.rotationDeg}deg)">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html getSymbolSvg(session.picker.current.id)}
		</span>
	</button>
{/if}

<style>
	.thumb-button {
		flex: 0 0 auto;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		padding: 4px;
		border: 1px solid rgba(31, 111, 115, 0.85);
		border-radius: 8px;
		background: rgba(31, 111, 115, 0.14);
		cursor: pointer;
	}

	.thumb {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
	}

	.thumb :global(svg) {
		width: 100%;
		height: 100%;
		overflow: visible;
	}
</style>
