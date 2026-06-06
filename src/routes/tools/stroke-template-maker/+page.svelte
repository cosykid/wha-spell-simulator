<script lang="ts">
	import { CONFIG } from '$lib/config.js';
	import Canvas from '$lib/ui/Canvas.svelte';
	import { createDrawController } from '$lib/ui/drawOnCanvas.svelte';
	import { normalizeStrokesForTemplate } from '$lib/parser/templateNormalizer.js';
	import { drawStrokes } from '$lib/renderer/glyphOverlayRenderer.js';
	import { drawPaper } from '$lib/renderer/paperRenderer.js';
	import { setStatus } from '$lib/state.svelte';

	let output = $state('');

	const draw = createDrawController({
		onCommit: () => setStatus('Drawing captured', 'prepared')
	});

	function buildTemplateExport() {
		return normalizeStrokesForTemplate(draw.getStrokes(), {
			samplesPerStroke: 32,
			digits: 4
		});
	}

	function exportTemplate() {
		output = JSON.stringify(buildTemplateExport(), null, 2);
		setStatus('Reference exported', 'prepared');
	}

	async function copyTemplate() {
		if (!output.trim()) {
			exportTemplate();
		}
		try {
			await navigator.clipboard.writeText(output);
			setStatus('Copied', 'active');
		} catch {
			setStatus('Copy blocked', 'invalid');
		}
	}

	function handleClear() {
		draw.clear();
		output = '';
		setStatus('Cleared', 'inactive');
	}

	function frame(ctx: CanvasRenderingContext2D) {
		const { width, height } = ctx.canvas;
		drawPaper(ctx, width, height);
		drawStrokes(ctx, draw.getStrokes(), draw.getCurrentStroke(), CONFIG);

		// Centering crosshair so symbols can be drawn balanced around the middle.
		ctx.save();
		ctx.strokeStyle = 'rgba(36, 27, 22, 0.24)';
		ctx.lineWidth = 1;
		ctx.setLineDash([8, 8]);
		ctx.beginPath();
		ctx.moveTo(width / 2, 0);
		ctx.lineTo(width / 2, height);
		ctx.moveTo(0, height / 2);
		ctx.lineTo(width, height / 2);
		ctx.stroke();
		ctx.restore();
	}
</script>

<svelte:head>
	<title>Stroke Template Maker</title>
</svelte:head>

<main class="workspace maker-workspace">
	<section class="canvas-panel maker-canvas-panel">
		<div class="toolbar">
			<button type="button" onclick={() => draw.undo()}>Undo</button>
			<button type="button" onclick={handleClear}>Clear</button>
			<button type="button" onclick={exportTemplate}>Export</button>
			<button type="button" onclick={copyTemplate}>Copy</button>
		</div>
		<Canvas controller={draw} onFrame={frame} />
	</section>

	<aside class="side-panel">
		<section class="diagnostic-block">
			<h2>Template JSON</h2>
			<textarea class="template-output" spellcheck="false" bind:value={output}></textarea>
		</section>
		<section class="diagnostic-block">
			<h2>Placement</h2>
			<pre class="diagnostic-output">Paste the exported object into the matching dictionary entry:

src/lib/dictionary/sigils.json
src/lib/dictionary/signs.json
-> strokeTemplate</pre>
		</section>
	</aside>
</main>
