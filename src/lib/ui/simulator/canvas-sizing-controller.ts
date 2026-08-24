import { setupCanvasSizing } from '$lib/ui/canvasSizing.js';
import type { StrokeStore } from '$lib/types.js';

/**
 * Inputs and callbacks for canvas backing-store and workspace layout sizing.
 */
interface CanvasSizingControllerOptions {
	/** Element that controls the square canvas layout. */
	canvasShell: () => HTMLDivElement;
	/** Glyph canvas whose backing store is resized. */
	glyphCanvas: () => HTMLCanvasElement;
	/** Effect canvas kept in sync with the glyph canvas. Re-read every pass: a style switch replaces it. */
	effectCanvas: () => HTMLCanvasElement | null;
	/** Workspace element used to decide desktop canvas-height matching. */
	workspace: () => HTMLElement;
	/** Freehand stroke store scaled when the canvas backing store changes. */
	store: StrokeStore;
	/** Called after the canvas backing store changes scale. */
	onCanvasScale: (scale: number) => void;
	/** Called when workspace layout should be re-evaluated. */
	onLayoutChange: () => void;
}

/**
 * Owns ResizeObserver lifecycle for canvas backing-store sizing and workspace
 * layout mode updates.
 */
export class CanvasSizingController {
	#resizeObserver: ResizeObserver | null = null;
	#workspaceResizeObserver: ResizeObserver | null = null;
	readonly #options: CanvasSizingControllerOptions;

	constructor(options: CanvasSizingControllerOptions) {
		this.#options = options;
	}

	/** Attaches canvas and workspace resize observers. */
	mount() {
		this.#resizeObserver = setupCanvasSizing({
			elements: {
				canvasShell: this.#options.canvasShell(),
				glyphCanvas: this.#options.glyphCanvas(),
				effectCanvas: this.#options.effectCanvas
			},
			store: this.#options.store,
			onCanvasResized: ({ scale }) => this.#options.onCanvasScale(scale)
		});
		this.#workspaceResizeObserver = new ResizeObserver(this.#options.onLayoutChange);
		this.#workspaceResizeObserver.observe(this.#options.workspace());
		window.addEventListener('resize', this.#options.onLayoutChange);
		this.#options.onLayoutChange();
	}

	/** Disconnects observers and window listeners. */
	stop() {
		this.#resizeObserver?.disconnect();
		this.#workspaceResizeObserver?.disconnect();
		window.removeEventListener('resize', this.#options.onLayoutChange);
	}
}
