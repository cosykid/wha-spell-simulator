<script lang="ts">
	import Canvas from '$canvas/Canvas.svelte';
	import type { Placement } from '$lib/types.js';
	import type { CanvasBehavior } from '$lib/ui/canvas/canvasBehavior.js';
	import { addEntity } from '$lib/ui/canvas/commands.js';
	import { makeSymbolEntity } from '$lib/ui/canvas/entities/symbolEntity.js';
	import { createScene } from '$lib/ui/canvas/scene.svelte.js';
	import { createDrawTool } from '$lib/ui/canvas/tools/drawTool.svelte.js';
	import { createSelectTool } from '$lib/ui/canvas/tools/selectTool.svelte.js';

	const scene = createScene();

	const draw = createDrawTool(scene);
	const select = createSelectTool(scene);

	let mode = $state<'draw' | 'select'>('draw');
	const tool = $derived<CanvasBehavior>(mode === 'draw' ? draw : select);

	let stamped = 0;

	// A triangle in the unit box [0, 1]², centered on (0.5, 0.5) like every Placement.
	const DEMO_BASE_STROKES = [
		[
			{ x: 0.5, y: 0.12 },
			{ x: 0.9, y: 0.88 },
			{ x: 0.1, y: 0.88 },
			{ x: 0.5, y: 0.12 }
		]
	];

	function stampSymbol(): void {
		const placement: Placement = {
			id: `sym${(stamped += 1)}`,
			kind: 'sign',
			sourceId: 'demo-triangle',
			baseStrokes: DEMO_BASE_STROKES.map((points) => points.map((point) => ({ ...point }))),
			transform: { cx: 380, cy: 380, scaleX: 160, scaleY: 160, rotationDeg: 0 }
		};
		scene.do(addEntity(scene, makeSymbolEntity(placement)));
		mode = 'select'; // jump to select so the new symbol's handles are ready
	}

	function clear(): void {
		scene.clear();
	}
</script>

<svelte:head>
	<title>Sample Maker</title>
</svelte:head>

<main class="workspace maker-workspace">
	<section class="canvas-panel maker-canvas-panel">
		<div class="toolbar">
			<div class="mode-toggle">
				<button type="button" class:active={mode === 'draw'} onclick={() => (mode = 'draw')}>
					Draw
				</button>
				<button type="button" class:active={mode === 'select'} onclick={() => (mode = 'select')}>
					Select
				</button>
			</div>
			<button type="button" onclick={stampSymbol}>Stamp symbol</button>
			<button type="button" disabled={!scene.canUndo()} onclick={() => scene.undo()}>Undo</button>
			<button type="button" disabled={!scene.canRedo()} onclick={() => scene.redo()}>Redo</button>
			<button type="button" onclick={clear}>Clear</button>
		</div>
		<Canvas {scene} controller={tool} />
	</section>
	<aside class="side-panel"></aside>
</main>
