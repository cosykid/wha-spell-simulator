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
 * A gesture that does not end on drawable canvas leaves the item "armed" instead
 * of throwing it away, so clicking a palette card and then clicking the canvas
 * places the shape just as dragging it across does. The placement behavior spends
 * the armed shape through `placeArmedShape`.
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

	/** Disarms the palette item and ends any drag gesture carrying it. */
	end = () => {
		this.#armedShape = null;
		this.armedShapeId = null;
		this.#endDrag();
	};

	#move = (event: PointerEvent) => {
		if (!this.#draggedShape || this.#pointerId !== event.pointerId) {
			return;
		}
		event.preventDefault();
		this.dragPreview = { item: this.#draggedShape, x: event.clientX, y: event.clientY };
	};

	/**
	 * A release on drawable canvas places the shape there. Anywhere else, including a
	 * plain click on the card without a drag, leaves it armed for the next canvas
	 * click rather than dropping it.
	 */
	#drop = (event: PointerEvent) => {
		if (!this.#draggedShape || this.#pointerId !== event.pointerId) {
			return;
		}
		event.preventDefault();
		const item = this.#draggedShape;
		this.#endDrag();
		if (!this.#canPlaceAt(event.clientX, event.clientY)) {
			return;
		}
		this.#armedShape = null;
		this.armedShapeId = null;
		this.#options.placeShape(
			item,
			this.#options.canvasPointFromClient(event.clientX, event.clientY)
		);
		this.#options.focusCanvasShell();
	};

	/** Ends the pointer gesture, leaving an armed item armed. */
	#endDrag() {
		this.#draggedShape = null;
		this.#pointerId = null;
		this.dragPreview = null;
		window.removeEventListener('pointermove', this.#move);
		window.removeEventListener('pointerup', this.#drop);
		window.removeEventListener('pointercancel', this.#drop);
	}

	/**
	 * Whether a release point lands on canvas the user can actually see. The glyph
	 * canvas covers the whole viewport, so an open drawer stands over it and a drop
	 * there would place the shape underneath the panel, out of sight.
	 */
	#canPlaceAt(clientX: number, clientY: number) {
		const rect = this.#options.canvasRect();
		const insideCanvas =
			clientX >= rect.left &&
			clientX <= rect.right &&
			clientY >= rect.top &&
			clientY <= rect.bottom;
		return insideCanvas && !document.elementFromPoint(clientX, clientY)?.closest('.drawer.open');
	}
}
