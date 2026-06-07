<!--
@component
The Sample Maker's label picker: a grid of the available signs (with SVG thumbnails).
Clicking one calls `onpick`, which stamps it onto the canvas as the reference glyph.
-->
<script lang="ts">
	import { getSymbolSvg } from '$lib/dictionary/svgStrokes.js';
	import type { SampleSymbol } from './symbols.js';

	interface Props {
		symbols: SampleSymbol[];
		selectedId: string | null;
		onpick: (symbol: SampleSymbol) => void;
	}

	let { symbols, selectedId, onpick }: Props = $props();
</script>

<ul class="label-list">
	{#each symbols as symbol (symbol.id)}
		<li>
			<button
				type="button"
				class="label-item"
				class:active={symbol.id === selectedId}
				onclick={() => onpick(symbol)}
			>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				<span class="thumb">{@html getSymbolSvg(symbol.id)}</span>
				<span class="name">{symbol.displayName}</span>
			</button>
		</li>
	{/each}
</ul>

<style>
	.label-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
		gap: 10px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.label-item {
		display: grid;
		justify-items: center;
		gap: 6px;
		width: 100%;
		padding: 10px 8px;
		border: 1px solid rgba(36, 27, 22, 0.2);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.34);
		cursor: pointer;
	}

	.label-item:hover {
		background: rgba(255, 255, 255, 0.6);
	}

	.label-item.active {
		border-color: rgba(31, 111, 115, 0.85);
		background: rgba(31, 111, 115, 0.14);
	}

	.thumb {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
	}

	.thumb :global(svg) {
		width: 100%;
		height: 100%;
		overflow: visible;
	}

	.name {
		font-size: 13px;
		color: var(--muted-ink);
	}
</style>
