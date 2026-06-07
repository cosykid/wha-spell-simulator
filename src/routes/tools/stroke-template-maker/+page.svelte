<script lang="ts">
	import Canvas from '$canvas/Canvas.svelte';
	import { crosshairEntity } from '$canvas/entities/crosshairEntity.js';
	import { paperEntity } from '$canvas/entities/paperEntity.js';
	import type { StrokeEntity } from '$canvas/entities/strokeEntity.js';
	import { createScene } from '$canvas/scene.svelte.js';
	import { createDrawTool } from '$canvas/tools/drawTool.svelte.js';
	import { normalizeStrokesForTemplate } from '$lib/parser/templateNormalizer.js';
	import { setStatus } from '$lib/state.svelte';

	const scene = createScene([paperEntity(), crosshairEntity()]);
	const draw = createDrawTool(scene);

	const strokes = $derived(
		scene
			.getEntities()
			.filter((e): e is StrokeEntity => 'stroke' in e)
			.map((e) => e.stroke)
	);

	let output = $state('');

	$effect(() => {
		if (strokes.length > 0) setStatus('Drawing captured', 'prepared');
	});

	function buildTemplateExport() {
		return normalizeStrokesForTemplate(strokes, {
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
		scene.clear();
		output = '';
		setStatus('Cleared', 'inactive');
	}
</script>

<svelte:head>
	<title>Stroke Template Maker</title>
</svelte:head>

<main class="workspace maker-workspace">
	<section class="canvas-panel maker-canvas-panel">
		<div class="toolbar">
			<button type="button" disabled={!scene.canUndo()} onclick={() => scene.undo()}>Undo</button>
			<button type="button" onclick={handleClear}>Clear</button>
			<button type="button" onclick={exportTemplate}>Export</button>
			<button type="button" onclick={copyTemplate}>Copy</button>
		</div>
		<Canvas {scene} controller={draw} />
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
