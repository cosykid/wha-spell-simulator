import type { ShapeItem, Vector } from '$lib/types.js';
import type { CanvasTool } from './mode.js';

/**
 * Session callbacks needed to bridge palette dragging and canvas placement.
 */
interface ShapeDragControllerOptions {
	/** Returns the active canvas tool. */
	activeTool: () => CanvasTool;
	/** Switches canvas tool mode. */
	setTool: (tool: CanvasTool) => void;
	/** Converts viewport coordinates into backing-canvas coordinates. */
	canvasPointFromClient: (clientX: number, clientY: number) => Vector;
	/** Current glyph canvas client rectangle. */
	canvasRect: () => DOMRect;
	/** Focuses the canvas shell after a successful drop. */
	focusCanvasShell: () => void;
	/** Places a palette item at a canvas point. */
	placeShape: (item: ShapeItem, point: Vector) => string;
}

/**
 * Tracks palette drag state and drop-to-canvas placement.
 *
 * It also supports "armed" shapes for click-to-place behavior used by the
 * placement controller after a palette drag switches into arrange mode.
 */
export class ShapeDragController {
	/** Palette item id currently armed for placement. */
	armedShapeId = $state<string | null>(null);
	/** Floating preview rendered while dragging from the palette. */
	dragPreview = $state<{ item: ShapeItem; x: number; y: number } | null>(null);

	#armedShape: ShapeItem | null = null;
	#draggedShape: ShapeItem | null = null;
	#pointerId: number | null = null;
	readonly #options: ShapeDragControllerOptions;

	constructor(options: ShapeDragControllerOptions) {
		this.#options = options;
	}

	/** Whether a palette item is currently armed for click-to-place. */
	hasArmedShape() {
		return this.#armedShape !== null;
	}

	/**
	 * Places the armed palette item and clears the armed state.
	 *
	 * @returns The new placement id, or `null` when no shape is armed.
	 */
	placeArmedShape = (point: Vector): string | null => {
		if (!this.#armedShape) {
			return null;
		}
		const placed = this.#options.placeShape(this.#armedShape, point);
		this.#armedShape = null;
		this.armedShapeId = null;
		return placed;
	};

	/** Starts a palette drag gesture and switches the canvas into arrange mode. */
	begin = (item: ShapeItem, event: PointerEvent) => {
		if (event.button !== undefined && event.button !== 0) {
			return;
		}
		event.preventDefault();
		this.end();
		this.#draggedShape = item;
		this.#armedShape = item;
		this.armedShapeId = item.id;
		this.#pointerId = event.pointerId;
		this.dragPreview = { item, x: event.clientX, y: event.clientY };
		if (this.#options.activeTool() !== 'arrange') {
			this.#options.setTool('arrange');
		}
		window.addEventListener('pointermove', this.#move);
		window.addEventListener('pointerup', this.#drop);
		window.addEventListener('pointercancel', this.#drop);
	};

	/** Clears drag state and removes global pointer listeners. */
	end = () => {
		this.#draggedShape = null;
		this.#armedShape = null;
		this.armedShapeId = null;
		this.#pointerId = null;
		this.dragPreview = null;
		window.removeEventListener('pointermove', this.#move);
		window.removeEventListener('pointerup', this.#drop);
		window.removeEventListener('pointercancel', this.#drop);
	};

	#move = (event: PointerEvent) => {
		if (!this.#draggedShape || this.#pointerId !== event.pointerId) {
			return;
		}
		event.preventDefault();
		this.dragPreview = { item: this.#draggedShape, x: event.clientX, y: event.clientY };
	};

	#drop = (event: PointerEvent) => {
		if (!this.#draggedShape || this.#pointerId !== event.pointerId) {
			return;
		}
		event.preventDefault();
		const item = this.#draggedShape;
		const rect = this.#options.canvasRect();
		const insideCanvas =
			event.clientX >= rect.left &&
			event.clientX <= rect.right &&
			event.clientY >= rect.top &&
			event.clientY <= rect.bottom;
		this.end();
		if (insideCanvas) {
			this.#options.placeShape(
				item,
				this.#options.canvasPointFromClient(event.clientX, event.clientY)
			);
			this.#options.focusCanvasShell();
		}
	};
}
