<!--
@component
A canvas surface that renders a `Scene` (a z-ordered list of self-drawing entities) and
forwards pointer input to an active tool. Compose visuals as entities instead of writing a
per-frame draw function.

Usage:
```svelte
<script lang="ts">
  import Canvas from '$canvas/Canvas.svelte';
  import { createScene } from '$canvas/scene.svelte.js';
  import { createDrawTool } from '$canvas/tools/drawTool.svelte.js';
  import { createSelectTool } from '$canvas/tools/selectTool.svelte.js';

  const scene = createScene();            

  const draw = createDrawTool(scene);     // captures strokes -> entities
  const select = createSelectTool(scene); // moves/rotates/scales symbol entities
  let mode = $state<'draw' | 'select'>('draw');
  const tool = $derived(mode === 'draw' ? draw : select);
</script>

<Canvas {scene} controller={tool} />
<button onclick={() => scene.undo()} disabled={!scene.canUndo()}>Undo</button>
```

- `scene` — what to draw. Mutate it through commands (`scene.do(addEntity(scene, e))`) so every
  edit shares one undo/redo history; `scene.add()` inserts non-undoable items like the background.
- `controller` — the active `CanvasBehavior` (a tool); swap it to change interaction mode.
- `onFrame` / `bind:ctx` — escape hatch for bespoke or multi-canvas drawing that does not fit the
  entity model; runs after the scene each frame.
-->
<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { resizeCanvas } from './actions/resize.svelte.js';
	import type { CanvasBehavior } from './canvasBehavior.js';
	import type { Scene } from './scene.svelte.js';

	interface Props {
		/** Fixed backing-store size. Ignored when `resize` is true. */
		width?: number;
		height?: number;
		/** Size the backing store to the shell via a ResizeObserver. */
		resize?: boolean;
		/** Shell max width in px. */
		maxWidth?: number;
		/** Shell aspect ratio, e.g. '1 / 1'. */
		aspectRatio?: string;
		/** Entities to render each frame; create via `createScene()`. */
		scene?: Scene;
		/** Active interaction (draw/select tool, or legacy `DrawController`). */
		controller?: CanvasBehavior;
		/** Runs a requestAnimationFrame loop when provided. Escape hatch for bespoke rendering. */
		onFrame?: (ctx: CanvasRenderingContext2D, timestamp: number) => void;
		/** Exposes the 2D context for on-demand drawing. */
		ctx?: CanvasRenderingContext2D | null;
	}

	let {
		width = 800,
		height = 800,
		resize = false,
		maxWidth = 760,
		aspectRatio = '1 / 1',
		scene,
		controller,
		onFrame,
		ctx = $bindable(null)
	}: Props = $props();

	let shell = $state<HTMLElement>();

	const captureContext: Attachment<HTMLCanvasElement> = (canvas) => {
		ctx = canvas.getContext('2d');
		return () => {
			ctx = null;
		};
	};

	$effect(() => {
		const context = ctx;
		if (!context) {
			return;
		}
		// Read scene/controller/onFrame inside the loop so swapping the active tool or
		// scene takes effect without restarting the animation frame.
		let rafId = requestAnimationFrame(function loop(timestamp) {
			scene?.render(context, timestamp);
			controller?.render?.(context, timestamp);
			onFrame?.(context, timestamp);
			rafId = requestAnimationFrame(loop);
		});
		return () => cancelAnimationFrame(rafId);
	});
</script>

<div
	class="canvas-shell"
	bind:this={shell}
	style="--canvas-max-width: {maxWidth}px; --canvas-aspect: {aspectRatio};"
>
	<canvas
		{width}
		{height}
		{@attach captureContext}
		{@attach controller && controller.attach}
		{@attach resize &&
			shell &&
			resizeCanvas({
				shell,
				onResized(scaleX, scaleY) {
					for (const entity of scene?.getEntities() ?? []) {
						entity.scale?.(scaleX, scaleY);
					}
					controller?.onResize?.(scaleX, scaleY);
				}
			})}
	></canvas>
</div>

<style>
	.canvas-shell {
		position: relative;
		width: min(100%, var(--canvas-max-width));
		max-height: calc(100vh - 178px);
		aspect-ratio: var(--canvas-aspect, 1 / 1);
		margin: 14px auto;
		background: var(--paper);
		touch-action: none;
	}

	.canvas-shell canvas {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
