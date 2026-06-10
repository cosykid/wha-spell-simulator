<!--
@component
The Sample Maker's pick-and-draw flow. By default it suggests a random sign at a random
orientation so the dataset gets even coverage across signs and angles; "choose a sign myself"
swaps the preview for the full label grid instead. Either way the choice is only a *preview* —
nothing is stamped on the canvas (that would get in the way of drawing). Once the contributor
has drawn the sign freehand, "Label" (`onpick`) drops the reference glyph onto their strokes
for fine-tuning.
-->
<script lang="ts">
	import { getSymbolSvg } from '$lib/dictionary/svgStrokes.js';
	import ButtonWithShortcut from '$lib/ui/ButtonWithShortcut.svelte';
	import Labels from './Labels.svelte';
	import Phase from './Phase.svelte';
	import type { SampleSymbol } from './symbols.js';

	interface Props {
		/** The signs to draw suggestions from. */
		symbols: SampleSymbol[];
		/** Whether the canvas has at least one hand-drawn stroke — gates the "Label" action. */
		hasStrokes: boolean;
		/** Drop the previewed glyph onto the canvas at its orientation, so the contributor can fine-tune. */
		onpick: (symbol: SampleSymbol, rotationDeg: number) => void;
	}

	let { symbols, hasStrokes, onpick }: Props = $props();

	let current = $state<SampleSymbol | null>(null);
	let rotationDeg = $state(0);
	// Whether the label grid is shown for a manual pick instead of the random-suggestion preview.
	let choosing = $state(false);

	/**
	 * Preview a sign at a random orientation — random sign when called bare, or the given one when
	 * picked from the grid. Only updates the preview, never the canvas.
	 */
	export function suggest(symbol?: SampleSymbol): void {
		current = symbol ?? symbols[Math.floor(Math.random() * symbols.length)];
		rotationDeg = Math.floor(Math.random() * 360);
		choosing = false;
	}

	/** Stamp the previewed glyph onto the canvas for fine-tuning. No-op until a sign is previewed. */
	export function label(): void {
		if (current) onpick(current, rotationDeg);
	}

	// Seed the first suggestion once the component is on screen.
	$effect(() => {
		if (!current) suggest();
	});
</script>

<Phase step={1} title="Pick a sign to draw">
	{#snippet intro()}
		We'll suggest a random sign at a random orientation. Re-roll until you get one you like — or
		pick a sign yourself.
	{/snippet}
	<div class="pick-actions">
		<button type="button" onclick={() => suggest()}>Suggest another</button>
		<button type="button" onclick={() => (choosing = true)}>Choose a sign myself</button>
	</div>
	{#if choosing}
		<Labels {symbols} selectedId={current?.id ?? null} onpick={suggest} />
	{:else if current}
		<div class="preview">
			<!-- Rotated to the suggested angle; positive degrees turn clockwise, matching the canvas. -->
			<span class="thumb" style="transform: rotate({rotationDeg}deg)">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html getSymbolSvg(current.id)}
			</span>
			<span class="preview-name">{current.displayName}</span>
		</div>
	{/if}
</Phase>

<Phase step={2} title="Draw &amp; label it">
	{#snippet intro()}
		Draw the sign on the canvas freehand, by eye, at the orientation shown above. When you're happy
		with it, click <strong>Label</strong> to drop the reference glyph onto your strokes, then
		<strong>Fit label</strong> to fine-tune the alignment.
	{/snippet}
	<div class="action-row">
		<ButtonWithShortcut
			description="Label"
			shortcut="Ctrl+D"
			disabled={!current || !hasStrokes}
			onclick={label}
		/>
	</div>
</Phase>

<style>
	.pick-actions {
		display: flex;
		gap: 8px;
		margin-bottom: 10px;
	}

	.pick-actions button {
		flex: 1 1 auto;
	}

	.action-row {
		display: flex;
		justify-content: center;
	}

	.preview {
		display: grid;
		justify-items: center;
		align-content: center;
		gap: 8px;
		min-height: 300px;
		padding: 18px;
		border: 1px solid rgba(31, 111, 115, 0.85);
		border-radius: 8px;
		background: rgba(31, 111, 115, 0.14);
	}

	.thumb {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 160px;
		height: 160px;
	}

	.thumb :global(svg) {
		width: 100%;
		height: 100%;
		overflow: visible;
	}

	.preview-name {
		font-size: 18px;
		font-weight: 600;
		color: var(--ink, #241b16);
	}
</style>
