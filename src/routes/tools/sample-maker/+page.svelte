<script lang="ts">
	import Canvas from '$canvas/Canvas.svelte';
	import type { CanvasBehavior } from '$canvas/canvasBehavior.js';
	import { addEntity, transformEntity } from '$canvas/commands.js';
	import { gridEntity } from '$canvas/entities/gridEntity.js';
	import { paperEntity } from '$canvas/entities/paperEntity';
	import { isStrokeEntity } from '$canvas/entities/strokeEntity.js';
	import { isSymbolEntity, makeSymbolEntity } from '$canvas/entities/symbolEntity.js';
	import { isTransformable } from '$canvas/entity.js';
	import { createScene } from '$canvas/scene.svelte.js';
	import { createDrawTool } from '$canvas/tools/drawTool.svelte.js';
	import { createSelectTool } from '$canvas/tools/selectTool.svelte.js';
	import { loadSymbolRenderPath } from '$lib/dictionary/svgStrokes.js';
	import type { Placement } from '$lib/types.js';
	import ButtonWithShortcut from '$lib/ui/ButtonWithShortcut.svelte';
	import {
		createKeyDownHandler,
		type ButtonWithShortcut as ButtonWithShortcutDef
	} from '$lib/ui/keybindings.js';
	import SampleSubmit from './SampleSubmit.svelte';
	import SuggestionPrompt from './SuggestionPrompt.svelte';
	import { REFERENCE_SIZE } from './buildSample.js';
	import { SYMBOL_ID } from './constants.js';
	import { optimizePlacement } from './optimize.js';
	import { SAMPLE_SYMBOLS, type SampleSymbol } from './symbols.js';

	// Scene and tools
	const scene = createScene([paperEntity(), gridEntity(REFERENCE_SIZE)]);
	const draw = createDrawTool(scene);
	const select = createSelectTool(scene);

	// State
	let selected = $state<SampleSymbol | null>(null);
	let ctx = $state<CanvasRenderingContext2D | null>(null);
	let sampleSubmit = $state<ReturnType<typeof SampleSubmit>>();
	let suggestionPrompt = $state<ReturnType<typeof SuggestionPrompt>>();
	let mode = $state<'draw' | 'select'>('draw');

	// Computed state
	const tool = $derived<CanvasBehavior>(mode === 'draw' ? draw : select);
	const hasStrokes = $derived(scene.getEntities().some(isStrokeEntity));
	const strokes = $derived(
		scene
			.getEntities()
			.filter(isStrokeEntity)
			.map((e) => e.stroke)
	);
	const symbolEntity = $derived.by(() => {
		const e = scene.get(SYMBOL_ID);
		return e && isTransformable(e) ? e : null;
	});

	// Switch mode by whether the symbol is in the scene, autoselecting it so its handles show up.
	const symbolInScene = $derived(scene.getEntities().some((e) => e.id === SYMBOL_ID));
	$effect(() => {
		mode = symbolInScene ? 'select' : 'draw';
		select.setSelectedId(symbolInScene ? SYMBOL_ID : null);
	});

	/**
	 * Stamp the picked symbol onto the canvas as the reference glyph (replacing any previous one),
	 * centered at a default scale and orientation — suggestions pass a random `rotationDeg`.
	 */
	const pickSymbol = (symbol: SampleSymbol, rotationDeg = 0): void => {
		// At most one symbol entity at a time — drop the previous one before stamping.
		scene.remove(SYMBOL_ID);
		const placement: Placement = {
			id: SYMBOL_ID,
			kind: 'sign',
			sourceId: symbol.id,
			baseStrokes: [], // sampled lazily by getBaseStrokes() only if the user runs "fit"
			transform: {
				cx: 400,
				cy: 400,
				scaleX: REFERENCE_SIZE,
				scaleY: REFERENCE_SIZE,
				rotationDeg
			}
		};
		scene.do(addEntity(scene, makeSymbolEntity(placement, loadSymbolRenderPath(symbol.id), 10, 7)));
		selected = symbol; // mode and selection are managed by the symbolInScene effect
	};

	/**
	 * Fit the reference glyph to the drawn strokes, making it easier to align submitted samples.
	 */
	const fitLabel = (): void => {
		const symbolEntity = scene.get(SYMBOL_ID);
		if (!symbolEntity || !isSymbolEntity(symbolEntity)) return;
		const strokes = scene
			.getEntities()
			.filter(isStrokeEntity)
			.map((e) => e.stroke);
		if (!strokes.length) return;
		const before = symbolEntity.placement.transform;
		const after = optimizePlacement({
			strokes,
			baseStrokes: symbolEntity.getBaseStrokes(),
			initial: before,
			canvasWidth: ctx!.canvas.width,
			canvasHeight: ctx!.canvas.height
		});
		scene.do(transformEntity(symbolEntity, before, after));
	};

	/** Reset the state completely, then offer a fresh suggestion (a no-op while choosing manually). */
	const clear = (): void => {
		scene.clear();
		selected = null;
		suggestionPrompt?.suggest();
	};

	const toolbar: ButtonWithShortcutDef[] = [
		{
			shortcut: 'Ctrl+Z',
			description: 'Undo',
			disabled: () => !scene.canUndo(),
			action: () => scene.undo()
		},
		{
			shortcut: 'Ctrl+Y',
			description: 'Redo',
			disabled: () => !scene.canRedo(),
			action: () => scene.redo()
		},
		{
			shortcut: 'Ctrl+Enter',
			description: 'Fit label',
			disabled: () => !selected || !hasStrokes,
			action: fitLabel
		},
		{ shortcut: 'Ctrl+L', description: 'Clear', action: clear }
	];

	// Shortcuts for actions that live in the side-panel components rather than the canvas toolbar.
	const labelShortcut: ButtonWithShortcutDef = {
		shortcut: 'Ctrl+D',
		description: 'Label',
		disabled: () => !hasStrokes,
		action: () => suggestionPrompt?.label()
	};
	const submitShortcut: ButtonWithShortcutDef = {
		shortcut: 'Ctrl+S',
		description: 'Submit sample',
		disabled: () => !selected || !hasStrokes,
		action: () => sampleSubmit?.submit()
	};

	const onKeyDown = createKeyDownHandler([...toolbar, labelShortcut, submitShortcut]);
</script>

<svelte:window onkeydown={onKeyDown} />

<svelte:head>
	<title>Sample Maker</title>
</svelte:head>

<main class="workspace maker-workspace">
	<section class="canvas-panel maker-canvas-panel">
		<div class="toolbar">
			{#each toolbar as item (item.shortcut)}
				<ButtonWithShortcut
					description={item.description}
					shortcut={item.shortcut}
					disabled={item.disabled?.() ?? false}
					onclick={item.action}
				/>
			{/each}
		</div>
		<Canvas {scene} controller={tool} bind:ctx />
	</section>
	<aside class="side-panel maker-side-panel">
		<header>
			<h2 class="panel-section-title">Dataset Builder</h2>
			<p class="builder-cta">Help us build a dataset to recognize hand-drawn spells!</p>
		</header>

		<SuggestionPrompt
			bind:this={suggestionPrompt}
			symbols={SAMPLE_SYMBOLS}
			{hasStrokes}
			onpick={pickSymbol}
		/>

		<SampleSubmit
			bind:this={sampleSubmit}
			{symbolEntity}
			{strokes}
			{selected}
			{ctx}
			onSuccess={clear}
		/>
	</aside>
</main>

<style>
	.maker-side-panel {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 14px;
		min-width: 0;
		overflow: auto;
	}

	.builder-cta {
		margin: 0 0 4px;
		font-size: 13px;
		line-height: 1.4;
		color: var(--muted-ink);
	}
</style>
