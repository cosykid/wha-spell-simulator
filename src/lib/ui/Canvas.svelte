<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import type { DrawController } from './drawOnCanvas.svelte.js';
	import { resizeCanvas } from './resizeCanvas.svelte.js';

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
		/** Makes the canvas interactive; create via `createDrawController()`. */
		controller?: DrawController;
		/** Runs a requestAnimationFrame loop when provided. */
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
		if (!onFrame || !context) {
			return;
		}
		let rafId = requestAnimationFrame(function loop(timestamp) {
			onFrame(context, timestamp);
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
					if (controller && controller.count() > 0) {
						controller.scale(scaleX, scaleY);
					}
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
