<!--
@component
The square drawing surface: the glyph canvas and the stacked effect canvas. It
owns the portal tilt (kept in the shared canvas.css so the spell-effect lab stays
in sync). History actions, tools, zoom, and the first-use hint now live in the
floating chrome around it, not here.

Both stacked canvases carry the same pan and zoom transform. The effect canvas is
a sibling of the pan container rather than a child of it, so it has to be moved
alongside or a pan mid-cast slides the ink out from under its spell.

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
		class:panning={pan.panning}
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
			width={1000}
			height={1000}
			fill
			scene={simulator.glyphScene}
			controller={simulator.canvasController}
			stableController
			onFrame={simulator.renderCanvasFrame}
		/>
	</div>
	<!-- Keyed on the style: a canvas that has handed out a `2d` context can never
	     host WebGL, and the failure is silent and permanent, so switching engines
	     destroys this element and mounts a fresh one. `data-effect-style` says
	     which engine owns it, so a test never has to probe for a context. -->
	{#key ui.effectStyle}
		<canvas
			id="effectCanvas"
			data-testid="effect-canvas"
			data-effect-style={ui.effectStyle}
			class:panning={pan.panning}
			bind:this={ui.effectCanvas}
			width="1000"
			height="1000"
			style="transform: translate({pan.panX}px, {pan.panY}px) scale({ui.zoomLevel});"
		></canvas>
	{/key}
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

	/* A drag rewrites the transform on every pointermove, so the eased transition
	   has to stand down or the canvas trails the pointer by its whole duration.
	   Zoom steps and recenter are single jumps and keep the easing. */
	.canvas-container.panning,
	#effectCanvas.panning {
		transition: none;
	}
</style>
