import type { StrokeStore } from '../types.js';

// The drawing surface is kept at a fixed 1:1 (square) aspect ratio so resizing
// the window only scales the canvas uniformly and can never skew the drawn
// strokes. CSS letterboxes the displayed canvas to the same ratio; this module
// keeps the backing-store resolution locked to it.
const CANVAS_ASPECT = 1; // 1:1 (square)

interface CanvasSizingElements {
	canvasShell: HTMLElement;
	glyphCanvas: HTMLCanvasElement;
	effectCanvas: HTMLCanvasElement;
	/** Optional WebGL effect canvas kept at the same backing resolution. */
	fieldCanvas3d?: HTMLCanvasElement | null;
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

		if (previousWidth === width && previousHeight === height) {
			return;
		}

		// A single uniform scale factor (driven by width, since the ratio is
		// constant) keeps strokes proportional — they are never stretched.
		const scale = width / Math.max(1, previousWidth);
		const hadInk = store.count() > 0;

		elements.glyphCanvas.width = width;
		elements.glyphCanvas.height = height;
		elements.effectCanvas.width = width;
		elements.effectCanvas.height = height;
		if (elements.fieldCanvas3d) {
			elements.fieldCanvas3d.width = width;
			elements.fieldCanvas3d.height = height;
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
