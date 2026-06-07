import type {
	PlacementControllerApi,
	PlacementHandle,
	PlacementStore,
	PlacementTransform,
	Vector
} from '../types.js';
import {
	clampShapeSize,
	hitTestHandles,
	hitTestPlacement,
	rotationDegToPoint,
	toLocalPoint
} from './shapeBaker.js';

import { canvasPointFromEvent } from './pointerNormalizer.js';
import { distance } from '../utils/geometry.js';

type DragOp =
	| { type: 'move'; id: string; last: Vector }
	| { type: 'scale'; id: string; startDistance: number; startScaleX: number; startScaleY: number }
	| { type: 'elongate-x'; id: string }
	| { type: 'elongate-x-left'; id: string }
	| { type: 'elongate-y'; id: string }
	| { type: 'elongate-y-top'; id: string }
	| { type: 'rotate'; id: string };

// Drives shape placement and transform handles on the glyph canvas while arrange mode
// is active. Freehand drawing capture is locked during this time, so the two pointer
// handlers never fight over the same gesture.
export class PlacementController {
	private canvas: HTMLCanvasElement;
	private store: PlacementStore;
	private api: PlacementControllerApi;
	private active = false;
	private dragOp: DragOp | null = null;
	private pointerId: number | null = null;
	private moved = false;

	constructor(canvas: HTMLCanvasElement, store: PlacementStore, api: PlacementControllerApi) {
		this.canvas = canvas;
		this.store = store;
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
			this.dragOp = null;
		}
	}

	private handlePointerDown(event: PointerEvent): void {
		if (!this.active || (event.button !== undefined && event.button !== 0)) {
			return;
		}
		event.preventDefault();
		const point = canvasPointFromEvent(event, this.canvas);

		const selectedId = this.api.getSelectedId();
		const selected = selectedId ? this.store.get(selectedId) : null;
		if (selected) {
			const handle = hitTestHandles(selected, point);
			if (handle) {
				this.beginHandleDrag(event, selected.id, selected.transform, handle, point);
				return;
			}
		}

		const hit = [...this.store.getPlacements()]
			.reverse()
			.find((placement) => hitTestPlacement(placement, point));
		if (hit) {
			this.api.setSelectedId(hit.id);
			this.beginDrag(event, { type: 'move', id: hit.id, last: point });
			return;
		}

		if (this.api.hasArmedShape()) {
			const placed = this.api.placeShape(point);
			if (placed) {
				this.beginDrag(event, { type: 'move', id: placed, last: point });
			}
			return;
		}

		this.api.setSelectedId(null);
	}

	private beginHandleDrag(
		event: PointerEvent,
		id: string,
		transform: PlacementTransform,
		handle: PlacementHandle,
		point: Vector
	): void {
		if (handle.type === 'scale') {
			const center = { x: transform.cx, y: transform.cy };
			this.beginDrag(event, {
				type: 'scale',
				id,
				startDistance: Math.max(1, distance(center, point)),
				startScaleX: transform.scaleX,
				startScaleY: transform.scaleY
			});
		} else {
			this.beginDrag(event, { type: handle.type, id });
		}
	}

	private beginDrag(event: PointerEvent, dragOp: DragOp): void {
		this.dragOp = dragOp;
		this.moved = false;
		this.canvas.setPointerCapture?.(event.pointerId);
		this.pointerId = event.pointerId;
	}

	private handlePointerMove(event: PointerEvent): void {
		if (!this.active || !this.dragOp || this.pointerId !== event.pointerId) {
			return;
		}
		event.preventDefault();
		const point = canvasPointFromEvent(event, this.canvas);
		const placement = this.store.get(this.dragOp.id);
		if (!placement) {
			return;
		}

		const transform = placement.transform;
		if (this.dragOp.type === 'move') {
			this.store.update(this.dragOp.id, {
				cx: transform.cx + (point.x - this.dragOp.last.x),
				cy: transform.cy + (point.y - this.dragOp.last.y)
			});
			this.dragOp.last = point;
		} else if (this.dragOp.type === 'scale') {
			const center = { x: transform.cx, y: transform.cy };
			const factor = distance(center, point) / this.dragOp.startDistance;
			this.store.update(this.dragOp.id, {
				scaleX: clampShapeSize(this.dragOp.startScaleX * factor),
				scaleY: clampShapeSize(this.dragOp.startScaleY * factor)
			});
		} else if (this.dragOp.type === 'elongate-x' || this.dragOp.type === 'elongate-x-left') {
			this.store.update(this.dragOp.id, {
				scaleX: clampShapeSize(Math.abs(toLocalPoint(transform, point).x) * 2)
			});
		} else if (this.dragOp.type === 'elongate-y' || this.dragOp.type === 'elongate-y-top') {
			this.store.update(this.dragOp.id, {
				scaleY: clampShapeSize(Math.abs(toLocalPoint(transform, point).y) * 2)
			});
		} else if (this.dragOp.type === 'rotate') {
			this.store.update(this.dragOp.id, { rotationDeg: rotationDegToPoint(transform, point) });
		}

		this.moved = true;
		this.api.onChange();
	}

	private handlePointerUp(event: PointerEvent): void {
		if (!this.dragOp || this.pointerId !== event.pointerId) {
			return;
		}
		event.preventDefault();
		this.canvas.releasePointerCapture?.(event.pointerId);
		const moved = this.moved;
		this.dragOp = null;
		this.pointerId = null;
		this.moved = false;
		this.api.onChange();
		if (moved) {
			this.api.onInteractionEnd();
		}
	}
}
