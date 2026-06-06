import type { Point, Stroke, StrokeStore } from '../types.js';
import { canvasPointFromEvent, shouldKeepPoint } from '../input/pointerNormalizer.js';

import type { Attachment } from 'svelte/attachments';
import { CONFIG } from '../config.js';
import { createReactiveStrokeStore } from './strokeStore.svelte.js';
import { pathLength } from '../utils/geometry.js';

export interface DrawControllerCallbacks {
	onPreview?: (stroke: Stroke | null) => void;
	onCommit?: () => void;
}

export interface DrawController extends StrokeStore {
	getCurrentStroke(): Stroke | null;
	/** Apply with `{@attach controller.attach}` on a `<canvas>`. */
	attach: Attachment<HTMLCanvasElement>;
}

/**
 * Capture pointer input on a canvas and turn it into committed strokes, with undo/redo support and a live preview of the current stroke.
 *
 * Intended to replace the `DrawingCapture` class with a more Svelte-friendly API.
 *
 * @example
 * ```svelte
 * <script>
 * const controller = createDrawController({
 *   onPreview: (stroke) => { ... },
 *   onCommit: () => { ... }
 * });
 *
 * // Fetch committed strokes anywhere with `controller.getStrokes()` (reactive).
 * </script>
 *
 * <canvas {@attach controller.attach} />
 * ```
 */
export function createDrawController(callbacks: DrawControllerCallbacks = {}): DrawController {
	const store = createReactiveStrokeStore();
	let current = $state<Point[]>([]);

	function getCurrentStroke(): Stroke | null {
		if (current.length === 0) {
			return null;
		}
		return { id: 'preview', points: current.map((point) => ({ ...point })) };
	}

	const attach: Attachment<HTMLCanvasElement> = (canvas) => {
		let pointerId: number | null = null;

		function handlePointerDown(event: PointerEvent): void {
			if (event.button !== undefined && event.button !== 0) {
				return;
			}
			event.preventDefault();
			pointerId = event.pointerId;
			canvas.setPointerCapture?.(event.pointerId);
			current = [canvasPointFromEvent(event, canvas)];
			callbacks.onPreview?.(getCurrentStroke());
		}

		function handlePointerMove(event: PointerEvent): void {
			if (pointerId !== event.pointerId) {
				return;
			}
			event.preventDefault();
			const point = canvasPointFromEvent(event, canvas);
			if (shouldKeepPoint(current, point, CONFIG.input.minPointDistance)) {
				current = [...current, point];
				callbacks.onPreview?.(getCurrentStroke());
			}
		}

		function handlePointerUp(event: PointerEvent): void {
			if (pointerId !== event.pointerId) {
				return;
			}
			event.preventDefault();
			canvas.releasePointerCapture?.(event.pointerId);

			const points = current;
			current = [];
			pointerId = null;

			if (points.length >= 2 && pathLength(points) >= CONFIG.input.minStrokeLength) {
				store.addStroke(points);
				callbacks.onCommit?.();
				return;
			}

			callbacks.onPreview?.(null);
		}

		canvas.addEventListener('pointerdown', handlePointerDown);
		canvas.addEventListener('pointermove', handlePointerMove);
		canvas.addEventListener('pointerup', handlePointerUp);
		canvas.addEventListener('pointercancel', handlePointerUp);

		return () => {
			canvas.removeEventListener('pointerdown', handlePointerDown);
			canvas.removeEventListener('pointermove', handlePointerMove);
			canvas.removeEventListener('pointerup', handlePointerUp);
			canvas.removeEventListener('pointercancel', handlePointerUp);
		};
	};

	return { ...store, getCurrentStroke, attach };
}
