<!--
@component
The square drawing surface: the glyph canvas and the stacked effect canvas. It
owns the portal tilt (kept in the shared canvas.css so the spell-effect lab stays
in sync). History actions, tools, zoom, and the first-use hint now live in the
floating chrome around it, not here.

The backing store is locked to 1:1 (see canvasSizing.ts), so the shell must stay
square; the stage centres it on the parchment.
-->
<script lang="ts">
	import Canvas from '$lib/ui/canvas/Canvas.svelte';
	import type { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';

	interface Props {
		simulator: SimulatorSession;
	}

	let { simulator }: Props = $props();
	let ui = $derived(simulator.ui);
	let pan = $derived(simulator.pan);
	let recognition = $derived(simulator.recognition);
</script>

<div
	class="canvas-shell"
	data-testid="canvas-shell"
	bind:this={ui.canvasShell}
	class:portal-active={recognition.summary.portalActive}
	style:--portal-fit={ui.portalFit}
	role="region"
	aria-label="Spell drawing canvas"
	tabindex="-1"
>
	<div
		class="canvas-container"
		data-testid="canvas-container"
		onpointerdown={pan.start}
		ondblclick={() => ui.panEnabled && pan.recenter()}
		tabindex="0"
		aria-label="Canvas container for panning"
		role="button"
		style="transform: translate({pan.panX}px, {pan.panY}px) scale({ui.zoomLevel});"
	>
		<Canvas
			id="glyphCanvas"
			testId="glyph-canvas"
			inputReady={ui.inputReady}
			bind:canvas={ui.glyphCanvas}
			canvasClass={recognition.summary.canvasLocked ? 'locked' : undefined}
			width={1000}
			height={1000}
			fill
			scene={simulator.glyphScene}
			controller={simulator.canvasController}
			stableController
			onFrame={simulator.renderCanvasFrame}
		/>
	</div>
	<canvas
		id="fieldCanvas3d"
		data-testid="field-canvas-3d"
		bind:this={ui.fieldCanvas3d}
		width="1000"
		height="1000"
		style="transform: scale({ui.zoomLevel});"
	></canvas>
	<canvas
		id="effectCanvas"
		data-testid="effect-canvas"
		bind:this={ui.effectCanvas}
		width="1000"
		height="1000"
		style="transform: scale({ui.zoomLevel});"
	></canvas>
</div>

<style>
	.canvas-container {
		position: absolute;
		inset: 0;
		z-index: 1;
		width: 100%;
		height: 100%;
		transform-origin: center center;
		transition: transform 0.22s cubic-bezier(0.25, 1, 0.5, 1);
		will-change: transform;
		transform-style: preserve-3d;
	}
</style>
