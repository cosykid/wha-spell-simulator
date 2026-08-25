import type { StrokeStore } from '../types.js';

// The drawing surface is kept at a fixed 1:1 (square) aspect ratio so resizing
// the window only scales the canvas uniformly and can never skew the drawn
// strokes. CSS letterboxes the displayed canvas to the same ratio; this module
// keeps the backing-store resolution locked to it.
const CANVAS_ASPECT = 1; // 1:1 (square)

interface CanvasSizingElements {
	canvasShell: HTMLElement;
	glyphCanvas: HTMLCanvasElement;
	/**
	 * Read fresh on every pass, not captured: switching effect style destroys the
	 * effect canvas and mounts another, so the element sized here is whichever one
	 * is live rather than the one that was mounted when the observer attached.
	 */
	effectCanvas: () => HTMLCanvasElement | null;
}

export interface CanvasResizeInfo {
	width: number;
	height: number;
	previousWidth: number;
	previousHeight: number;
	scale: number;
	hadInk: boolean;
}

export function setupCanvasSizing({
	elements,
	store,
	onCanvasResized
}: {
	elements: CanvasSizingElements;
	store: StrokeStore;
	onCanvasResized: (info: CanvasResizeInfo) => void;
}): ResizeObserver {
	function syncCanvasSize(): void {
		const rect = elements.canvasShell.getBoundingClientRect();
		// Derive the backing-store height from the width so the resolution stays
		// exactly 1:1 regardless of sub-pixel rounding in the shell's box.
		const width = Math.max(1, Math.round(rect.width));
		const height = Math.max(1, Math.round(width / CANVAS_ASPECT));
		const previousWidth = elements.glyphCanvas.width;
		const previousHeight = elements.glyphCanvas.height;
		const effectCanvas = elements.effectCanvas();

		if (previousWidth === width && previousHeight === height) {
			// The glyph canvas already fits, but a freshly mounted effect canvas may
			// not, so it is sized on every pass rather than only on a real resize.
			if (effectCanvas && (effectCanvas.width !== width || effectCanvas.height !== height)) {
				effectCanvas.width = width;
				effectCanvas.height = height;
			}
			return;
		}

		// A single uniform scale factor (driven by width, since the ratio is
		// constant) keeps strokes proportional — they are never stretched.
		const scale = width / Math.max(1, previousWidth);
		const hadInk = store.count() > 0;

		elements.glyphCanvas.width = width;
		elements.glyphCanvas.height = height;
		if (effectCanvas) {
			effectCanvas.width = width;
			effectCanvas.height = height;
		}

		if (hadInk && previousWidth > 0 && previousHeight > 0) {
			store.scale(scale, scale);
		}

		onCanvasResized({
			width,
			height,
			previousWidth,
			previousHeight,
			scale,
			hadInk
		});
	}

	syncCanvasSize();
	const resizeObserver = new ResizeObserver(syncCanvasSize);
	resizeObserver.observe(elements.canvasShell);
	window.addEventListener('orientationchange', syncCanvasSize);
	return resizeObserver;
}
