<!--
@component
Replays a saved spell's effect on a small stacked-canvas stage, driven by
{@link SpellPreviewDriver}. Clicking the stage replays the effect. Rendered
only while its card's preview is toggled on.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { SpellPreviewDriver } from '$lib/ui/library/spell-preview.js';
	import type { SpellPresetData } from '$lib/structures/spellPreset.js';
	import type { SpellIR } from '$lib/types.js';

	interface Props {
		data: SpellPresetData;
		previewIr: SpellIR;
		onEnded?: () => void;
	}

	let { data, previewIr, onEnded }: Props = $props();

	let shell = $state<HTMLButtonElement>();
	let glyphCanvas = $state<HTMLCanvasElement>();
	let effectCanvas = $state<HTMLCanvasElement>();
	let driver: SpellPreviewDriver | null = null;

	onMount(() => {
		if (!shell || !glyphCanvas || !effectCanvas) {
			return;
		}
		driver = new SpellPreviewDriver({
			glyphCanvas,
			effectCanvas,
			shell,
			data,
			previewIr,
			onEnded
		});
		return driver.start();
	});
</script>

<button
	type="button"
	class="preview-stage"
	data-testid="spell-preview-stage"
	title="Replay"
	bind:this={shell}
	onclick={() => driver?.restart()}
>
	<canvas bind:this={glyphCanvas}></canvas>
	<canvas bind:this={effectCanvas}></canvas>
</button>

<style>
	.preview-stage {
		position: relative;
		display: block;
		width: 100%;
		aspect-ratio: 1;
		padding: 0;
		overflow: hidden;
		border: 1px solid var(--ink-sepia-20);
		border-radius: 6px;
		background: var(--panel);
		box-shadow: none;
		cursor: pointer;
	}

	canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
</style>
