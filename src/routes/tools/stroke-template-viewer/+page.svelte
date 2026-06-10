<script lang="ts">
	import Canvas from '$canvas/Canvas.svelte';
	import { templateBoundsEntity, templateStrokeEntity } from '$canvas/entities/templateEntity.js';
	import { createScene } from '$canvas/scene.svelte.js';
	import { setStatus } from '$lib/state.svelte';
	import { parseTemplate, templateMetrics, validateTemplate } from '$lib/ui/strokeTemplateView.js';

	const PLACEHOLDER =
		'Paste a strokeTemplate object or a full dictionary entry, then click Render.';

	let input = $state('');
	let metrics = $state(PLACEHOLDER);
	const scene = createScene();

	function renderTemplate() {
		try {
			const parsed = validateTemplate(parseTemplate(input));
			scene.clear();
			scene.add(templateBoundsEntity(parsed));
			parsed.strokes.forEach((points, i) => {
				scene.add(templateStrokeEntity(points, `template-stroke-${i}`, parsed));
			});
			metrics = JSON.stringify(templateMetrics(parsed), null, 2);
			setStatus('Rendered', 'prepared');
		} catch (error) {
			scene.clear();
			metrics = error instanceof Error ? error.message : String(error);
			setStatus('Invalid JSON', 'invalid');
		}
	}

	function handleClear() {
		input = '';
		metrics = PLACEHOLDER;
		scene.clear();
		setStatus('Ready', '');
	}
</script>

<svelte:head>
	<title>Stroke Template Viewer</title>
</svelte:head>

<main class="workspace maker-workspace">
	<section class="canvas-panel maker-canvas-panel">
		<div class="toolbar">
			<button type="button" onclick={renderTemplate}>Render</button>
			<button type="button" onclick={handleClear}>Clear</button>
		</div>
		<Canvas {scene} />
	</section>

	<aside class="side-panel">
		<section class="diagnostic-block">
			<h2>Template JSON</h2>
			<textarea class="template-output" spellcheck="false" bind:value={input}></textarea>
		</section>
		<section class="diagnostic-block">
			<h2>Metrics</h2>
			<pre class="diagnostic-output">{metrics}</pre>
		</section>
	</aside>
</main>
