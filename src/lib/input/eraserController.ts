import type { EraserControllerApi, Vector } from '../types.js';
import { canvasPointFromEvent } from './pointerNormalizer.js';

// Drives partial erasing of freehand ink on the glyph canvas while erase mode
// is active. Drawing capture is locked during this time (same arrangement as
// the placement controller), so the two pointer handlers never fight over the
// same gesture. Erasure itself is applied by the api owner; this class only
// turns pointer events into capsule segments.
export class EraserController {
	private canvas: HTMLCanvasElement;
	private api: EraserControllerApi;
	private active = false;
	private pointerId: number | null = null;
	private last: Vector | null = null;
	private changed = false;

	constructor(canvas: HTMLCanvasElement, api: EraserControllerApi) {
		this.canvas = canvas;
		this.api = api;

		this.handlePointerDown = this.handlePointerDown.bind(this);
		this.handlePointerMove = this.handlePointerMove.bind(this);
		this.handlePointerUp = this.handlePointerUp.bind(this);
	}

	enable(): void {
		this.canvas.addEventListener('pointerdown', this.handlePointerDown);
		this.canvas.addEventListener('pointermove', this.handlePointerMove);
		this.canvas.addEventListener('pointerup', this.handlePointerUp);
		this.canvas.addEventListener('pointercancel', this.handlePointerUp);
	}

	disable(): void {
		this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
		this.canvas.removeEventListener('pointermove', this.handlePointerMove);
		this.canvas.removeEventListener('pointerup', this.handlePointerUp);
		this.canvas.removeEventListener('pointercancel', this.handlePointerUp);
	}

	setActive(active: boolean): void {
		this.active = active;
		if (!active) {
			this.pointerId = null;
			this.last = null;
			this.changed = false;
		}
	}

	private handlePointerDown(event: PointerEvent): void {
		if (!this.active || (event.button !== undefined && event.button !== 0)) {
			return;
		}
		event.preventDefault();
		this.canvas.setPointerCapture?.(event.pointerId);
		this.pointerId = event.pointerId;
		const point = canvasPointFromEvent(event, this.canvas);
		this.last = point;
		this.api.onBegin();
		this.changed = this.api.applyErase(point, point);
	}

	private handlePointerMove(event: PointerEvent): void {
		if (!this.active || this.pointerId !== event.pointerId || !this.last) {
			return;
		}
		event.preventDefault();
		const point = canvasPointFromEvent(event, this.canvas);
		if (this.api.applyErase(this.last, point)) {
			this.changed = true;
		}
		this.last = point;
	}

	private handlePointerUp(event: PointerEvent): void {
		if (this.pointerId !== event.pointerId) {
			return;
		}
		event.preventDefault();
		this.canvas.releasePointerCapture?.(event.pointerId);
		const changed = this.changed;
		this.pointerId = null;
		this.last = null;
		this.changed = false;
		this.api.onCommit(changed);
	}
}
