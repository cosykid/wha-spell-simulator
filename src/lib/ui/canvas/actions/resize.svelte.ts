import type { Attachment } from 'svelte/attachments';

export interface ResizeCanvasParams {
	/** The element the canvas should match in size. */
	shell: HTMLElement;
	/**
	 * Called after the canvas changes size, with the factors mapping the previous size to the new one.
	 */
	onResized?: (scaleX: number, scaleY: number) => void;
}

/**
 * Keep a canvas's size in sync with its shell container, so whenever the shell resizes, the canvas resizes too.
 *
 * Replacement for `setupCanvasSizing` that can be directly applied using the `{@attach}` Svelte directive on a `<canvas>`.
 *
 * @example
 * ```svelte
 * <script>
 * let shell: HTMLElement;
 * </script>
 *
 * <div bind:this={shell} class="canvas-surface">
 *   <canvas {@attach resizeCanvas({ shell, onResized: handleResize })} />
 * </div>
 * ```
 */
export function resizeCanvas(params: ResizeCanvasParams): Attachment<HTMLCanvasElement> {
	return (canvas) => {
		/**
		 * Get the shell's size and apply it to the canvas.
		 */
		function sync(): void {
			const rect = params.shell.getBoundingClientRect();
			const width = Math.max(1, Math.round(rect.width));
			const height = Math.max(1, Math.round(rect.height));
			const previousWidth = canvas.width;
			const previousHeight = canvas.height;

			if (previousWidth === width && previousHeight === height) {
				return;
			}

			canvas.width = width;
			canvas.height = height;

			if (previousWidth > 0 && previousHeight > 0) {
				params.onResized?.(width / previousWidth, height / previousHeight);
			}
		}

		sync();

		// Rerun sync whenever the shell resizes
		const resizeObserver = new ResizeObserver(sync);
		resizeObserver.observe(params.shell);
		window.addEventListener('orientationchange', sync);

		return () => {
			resizeObserver.disconnect();
			window.removeEventListener('orientationchange', sync);
		};
	};
}
