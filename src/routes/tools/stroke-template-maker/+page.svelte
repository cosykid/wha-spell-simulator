<script lang="ts">
	import { CONFIG } from '$lib/config.js';
	import { DrawingCapture } from '$lib/input/drawingCapture.js';
	import { createStrokeStore } from '$lib/input/strokeStore.js';
	import { normalizeStrokesForTemplate } from '$lib/parser/templateNormalizer.js';
	import { drawStrokes } from '$lib/renderer/glyphOverlayRenderer.js';
	import { drawPaper } from '$lib/renderer/paperRenderer.js';
	import { setStatus } from '$lib/state.svelte';
	import { onMount } from 'svelte';

	let output = $state('');

	let canvas: HTMLCanvasElement;
	const store = createStrokeStore();
	let capture: DrawingCapture | null = null;

	function buildTemplateExport() {
		return normalizeStrokesForTemplate(store.getStrokes(), {
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
		store.clear();
		output = '';
		setStatus('Cleared', 'inactive');
	}

	onMount(() => {
		const ctx = canvas.getContext('2d')!;

		function render() {
			drawPaper(ctx, canvas.width, canvas.height);
			drawStrokes(ctx, store.getStrokes(), capture?.getCurrentStroke(), CONFIG);

			// Centering crosshair so symbols can be drawn balanced around the middle.
			ctx.save();
			ctx.strokeStyle = 'rgba(36, 27, 22, 0.24)';
			ctx.lineWidth = 1;
			ctx.setLineDash([8, 8]);
			ctx.beginPath();
			ctx.moveTo(canvas.width / 2, 0);
			ctx.lineTo(canvas.width / 2, canvas.height);
			ctx.moveTo(0, canvas.height / 2);
			ctx.lineTo(canvas.width, canvas.height / 2);
			ctx.stroke();
			ctx.restore();

			rafId = requestAnimationFrame(render);
		}

		let rafId: number | null = null;
		capture = new DrawingCapture(canvas, store, CONFIG, {
			onCommit: () => setStatus('Drawing captured', 'prepared')
		});
		capture.enable();
		setStatus('Ready', '');
		rafId = requestAnimationFrame(render);

		return () => {
			if (rafId) {
				cancelAnimationFrame(rafId);
			}
			capture?.disable();
		};
	});
</script>

<svelte:head>
	<title>Stroke Template Maker</title>
</svelte:head>

<main class="workspace maker-workspace">
	<section class="canvas-panel maker-canvas-panel">
		<div class="toolbar">
			<button type="button" onclick={() => store.undo()}>Undo</button>
			<button type="button" onclick={handleClear}>Clear</button>
			<button type="button" onclick={exportTemplate}>Export</button>
			<button type="button" onclick={copyTemplate}>Copy</button>
		</div>
		<div class="reference-canvas-shell">
			<canvas bind:this={canvas} width="800" height="800"></canvas>
		</div>
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
