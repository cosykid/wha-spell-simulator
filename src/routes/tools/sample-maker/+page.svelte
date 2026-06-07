<script lang="ts">
	import Canvas from '$canvas/Canvas.svelte';
	import type { CanvasBehavior } from '$canvas/canvasBehavior.js';
	import { addEntity, transformEntity } from '$canvas/commands.js';
	import { gridEntity } from '$canvas/entities/gridEntity.js';
	import { paperEntity } from '$canvas/entities/paperEntity';
	import { isStrokeEntity } from '$canvas/entities/strokeEntity.js';
	import { makeSymbolEntity } from '$canvas/entities/symbolEntity.js';
	import { isTransformable } from '$canvas/entity.js';
	import { createScene } from '$canvas/scene.svelte.js';
	import { createDrawTool } from '$canvas/tools/drawTool.svelte.js';
	import { createSelectTool } from '$canvas/tools/selectTool.svelte.js';
	import { loadSymbolBaseStrokes } from '$lib/dictionary/svgStrokes.js';
	import type { Placement, Stroke } from '$lib/types.js';
	import { createKeyDownHandler, type ButtonWithShortcut } from '$lib/ui/keybindings.js';
	import Labels from './Labels.svelte';
	import { REFERENCE_SIZE, buildSampleSubmission } from './buildSample.js';
	import { optimizePlacement } from './optimize.js';
	import { SAMPLE_SYMBOLS, type SampleSymbol } from './symbols.js';

	/** The lone reference glyph: stamping a sign replaces any previous one. */
	const SYMBOL_ID = 'sample-symbol';

	// Scene and tools
	const scene = createScene([paperEntity(), gridEntity(REFERENCE_SIZE)]);
	const draw = createDrawTool(scene);
	const select = createSelectTool(scene);

	// State
	const hasStrokes = $derived(scene.getEntities().some(isStrokeEntity));
	let selected = $state<SampleSymbol | null>(null);
	let output = $state('');
	let ctx = $state<CanvasRenderingContext2D | null>(null);
	let mode = $state<'draw' | 'select'>('draw');
	const tool = $derived<CanvasBehavior>(mode === 'draw' ? draw : select);

	// Automatically switch mode based on whether the symbol entity is in the scene.
	const symbolInScene = $derived(scene.getEntities().some((e) => e.id === SYMBOL_ID));
	$effect(() => {
		mode = symbolInScene ? 'select' : 'draw';
		// Autoselect the symbol entity when it appears, so the handles show up
		select.setSelectedId(symbolInScene ? SYMBOL_ID : null);
	});

	/**
	 * Stamp the picked symbol onto the canvas as the reference glyph, replacing any previous one.
	 * The symbol is centered on the canvas with a default scale.
	 */
	const pickSymbol = (symbol: SampleSymbol): void => {
		// At most one symbol entity at a time — drop the previous one before stamping.
		scene.remove(SYMBOL_ID);
		const placement: Placement = {
			id: SYMBOL_ID,
			kind: 'sign',
			sourceId: symbol.id,
			baseStrokes: loadSymbolBaseStrokes(symbol.id),
			transform: {
				cx: 400,
				cy: 400,
				scaleX: REFERENCE_SIZE,
				scaleY: REFERENCE_SIZE,
				rotationDeg: 0
			}
		};
		scene.do(addEntity(scene, makeSymbolEntity(placement, 10, 7)));
		selected = symbol;
		// mode and selection are managed automatically by the symbolInScene effect.
	};

	/**
	 * Attempt to fit the reference glyph to the drawn strokes. Should make it easier for submitters to align their samples.
	 */
	const fitLabel = (): void => {
		const symbolEntity = scene.get(SYMBOL_ID);
		if (!symbolEntity || !isTransformable(symbolEntity)) return;
		const strokes = scene
			.getEntities()
			.filter(isStrokeEntity)
			.map((e) => e.stroke);
		if (!strokes.length) return;
		const before = symbolEntity.placement.transform;
		const after = optimizePlacement({
			strokes,
			baseStrokes: symbolEntity.placement.baseStrokes,
			initial: before,
			canvasWidth: ctx!.canvas.width,
			canvasHeight: ctx!.canvas.height
		});

		scene.do(transformEntity(symbolEntity, before, after));
	};

	/**
	 * Check if all the requirements for submissions are met, then builds a LabelledSample payload and prints it to the output textarea for preview.
	 * TODO: upload the payload to the database.
	 */
	const submit = (): void => {
		if (!selected) {
			output = '// Pick a sign label first.';
			return;
		}

		const symbolEntity = scene.get(SYMBOL_ID);
		if (!symbolEntity || !isTransformable(symbolEntity)) {
			output = '// The reference glyph is missing — pick a sign label again.';
			return;
		}

		const strokes: Stroke[] = scene
			.getEntities()
			.filter(isStrokeEntity)
			.map((entity) => entity.stroke);
		if (strokes.length === 0) {
			output = '// Draw the sign before submitting.';
			return;
		}

		const canvas = ctx?.canvas;
		const submission = buildSampleSubmission({
			strokes,
			symbol: selected,
			transform: symbolEntity.placement.transform,
			canvasWidth: canvas?.width ?? 0,
			canvasHeight: canvas?.height ?? 0,
			devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1
		});

		// TODO: upload this LabelledSample to the database.
		output = `// TODO: upload this LabelledSample to the DB\n${JSON.stringify(submission, null, 2)}`;
	};

	/**
	 * Reset the state completely.
	 */
	const clear = (): void => {
		scene.clear();
		selected = null;
		output = '';
	};

	const toolbar: ButtonWithShortcut[] = [
		{
			key: 'z',
			shift: false,
			shortcut: 'Ctrl+Z',
			description: 'Undo',
			disabled: () => !scene.canUndo(),
			action: () => scene.undo()
		},
		{
			key: 'y',
			shortcut: 'Ctrl+Y',
			description: 'Redo',
			disabled: () => !scene.canRedo(),
			action: () => scene.redo()
		},
		{
			key: 'Enter',
			shortcut: 'Ctrl+Enter',
			description: 'Fit label',
			disabled: () => !selected || !hasStrokes,
			action: fitLabel
		},
		{ key: 'l', shortcut: 'Ctrl+L', description: 'Clear', action: clear }
	];

	const submitButton: ButtonWithShortcut = {
		key: 's',
		shortcut: 'Ctrl+S',
		description: 'Submit sample',
		disabled: () => !selected || !hasStrokes,
		action: submit
	};

	const onKeyDown = createKeyDownHandler([...toolbar, submitButton]);
</script>

<svelte:window onkeydown={onKeyDown} />

<svelte:head>
	<title>Sample Maker</title>
</svelte:head>

{#snippet buttonWithShortcut(item: ButtonWithShortcut)}
	<button type="button" disabled={item.disabled?.() ?? false} onclick={item.action}>
		{item.description} <kbd>{item.shortcut}</kbd>
	</button>
{/snippet}

<main class="workspace maker-workspace">
	<section class="canvas-panel maker-canvas-panel">
		<div class="toolbar">
			{#each toolbar as item (item.key)}
				{@render buttonWithShortcut(item)}
			{/each}
		</div>
		<Canvas {scene} controller={tool} bind:ctx />
	</section>
	<aside class="side-panel maker-side-panel">
		<h2 class="panel-section-title">Sign label</h2>
		<Labels symbols={SAMPLE_SYMBOLS} selectedId={selected?.id ?? null} onpick={pickSymbol} />

		{@render buttonWithShortcut(submitButton)}

		<h2 class="panel-section-title">Sample output</h2>
		<textarea
			class="sample-output"
			readonly
			placeholder="Submit to preview the LabelledSample that will be uploaded…"
			value={output}
		></textarea>
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

	button kbd {
		display: inline-block;
		padding: 1px 5px;
		font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
		font-size: 10px;
		background: rgba(36, 27, 22, 0.07);
		border: 1px solid rgba(36, 27, 22, 0.18);
		border-radius: 3px;
		pointer-events: none;
	}

	.sample-output {
		flex: 1 1 auto;
		min-height: 220px;
		resize: vertical;
		font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
		font-size: 12px;
		line-height: 1.45;
		white-space: pre;
		border: 1px solid rgba(36, 27, 22, 0.2);
		border-radius: 6px;
		padding: 10px;
		background: rgba(255, 255, 255, 0.55);
	}
</style>
