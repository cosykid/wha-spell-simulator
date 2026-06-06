<script lang="ts">
	import { CONFIG } from '$lib/config.js';
	import Canvas from '$lib/ui/Canvas.svelte';
	import { createDrawController } from '$lib/ui/drawOnCanvas.svelte';
	import { drawStrokes } from '$lib/renderer/glyphOverlayRenderer.js';
	import { drawPaper } from '$lib/renderer/paperRenderer.js';

	const draw = createDrawController();

	function frame(ctx: CanvasRenderingContext2D) {
		drawPaper(ctx, ctx.canvas.width, ctx.canvas.height);
		drawStrokes(ctx, draw.getStrokes(), draw.getCurrentStroke(), CONFIG);
	}
</script>

<svelte:head>
	<title>Sample Maker</title>
</svelte:head>

<main class="workspace maker-workspace">
	<section class="canvas-panel maker-canvas-panel">
		<div class="toolbar">
			<button type="button" disabled={draw.count() === 0} onclick={() => draw.undo()}>Undo</button>
			<button type="button" onclick={() => draw.clear()}>Clear</button>
		</div>
		<Canvas controller={draw} onFrame={frame} />
	</section>
	<aside class="side-panel"></aside>
</main>
