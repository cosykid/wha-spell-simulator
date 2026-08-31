import { canvasPointFromEvent } from '$lib/input/pointerNormalizer.js';
import {
	clampShapeSize,
	HANDLE_HIT_RADIUS,
	hitTestHandles,
	ROTATE_HANDLE_OFFSET,
	rotationDegToPoint,
	toLocalPoint
} from '$lib/input/shapeBaker.js';
import type { CanvasBehavior } from '$lib/ui/canvas/canvasBehavior.js';
import type { PlacementEntity } from '$lib/ui/canvas/entities/placementEntity.js';
import type {
	Placement,
	PlacementHandle,
	PlacementStore,
	PlacementTransform,
	Vector
} from '$lib/types.js';
import type { Attachment } from 'svelte/attachments';

const TOUCH_HIT_SCALE = 2;

/** Resize cursors by octant, walking clockwise from the placement's own +x axis. */
const RESIZE_CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'] as const;

/** What the pointer is over in arrange mode, so the host can pick a cursor for it. */
export type ArrangeHover =
	| { over: 'body' }
	| { over: 'rotate' }
	| { over: 'resize'; dirX: number; dirY: number };

/**
 * The resize cursor for a handle lying in a given direction from its placement's
 * centre. Reading the direction rather than the handle's name means a rotated
 * shape points its cursors the way it actually sits.
 *
 * @example
 * canvas.style.cursor = resizeCursorForDirection(handle.x - transform.cx, handle.y - transform.cy);
 */
export function resizeCursorForDirection(dirX: number, dirY: number): string {
	// Canvas y points down, so this angle grows clockwise from the +x axis.
	const octant = Math.round(Math.atan2(dirY, dirX) / (Math.PI / 4));
	return RESIZE_CURSORS[((octant % 4) + 4) % 4];
}

type DragOp =
	| { type: 'move'; id: string; last: Vector }
	| {
			type: 'scale';
			id: string;
			startDistance: number;
			startScaleX: number;
			startScaleY: number;
			lxSign: number;
			lySign: number;
			startDirX: number;
			startDirY: number;
			anchorX: number;
			anchorY: number;
	  }
	| {
			type: 'elongate-x';
			id: string;
			anchorX: number;
			anchorY: number;
			startDistance: number;
			startDirX: number;
			startDirY: number;
			startScaleX: number;
	  }
	| {
			type: 'elongate-x-left';
			id: string;
			anchorX: number;
			anchorY: number;
			startDistance: number;
			startDirX: number;
			startDirY: number;
			startScaleX: number;
	  }
	| {
			type: 'elongate-y';
			id: string;
			anchorX: number;
			anchorY: number;
			startDistance: number;
			startDirX: number;
			startDirY: number;
			startScaleY: number;
	  }
	| { type: 'elongate-y-top'; id: string; baseX: number; baseY: number }
	| { type: 'rotate'; id: string };

interface SimulatorPlacementBehaviorOptions {
	placements: PlacementStore;
	placementEntities: () => PlacementEntity[];
	getSelectedId: () => string | null;
	setSelectedId: (id: string | null) => void;
	hasArmedShape: () => boolean;
	placeArmedShape: (point: Vector) => string | null;
	/** Reports what the pointer is resting over, so the host can pick a cursor. */
	onHoverChange: (hover: ArrangeHover | null) => void;
	onChange: () => void;
	onInteractionEnd: () => void;
}

/**
 * Canvas API behavior for simulator arrange mode.
 *
 * It treats editable shapes as Canvas placement entities for hit-testing, then
 * syncs all transform mutations back into the PlacementStore so recognition can
 * continue baking placements to Stroke[] only when recomputing.
 */
export function createSimulatorPlacementBehavior(
	options: SimulatorPlacementBehaviorOptions
): CanvasBehavior & { setActive(active: boolean): void } {
	let active = false;
	let cssToCanvas = 1;
	let dragOp: DragOp | null = null;
	let pointerId: number | null = null;
	let moved = false;

	function selectedPlacement(): Placement | null {
		const id = options.getSelectedId();
		return id ? options.placements.get(id) : null;
	}

	function hitPlacement(point: Vector): PlacementEntity | null {
		return (
			[...options.placementEntities()].reverse().find((entity) => entity.hitTest(point)) ?? null
		);
	}

	function beginDrag(canvas: HTMLCanvasElement, event: PointerEvent, nextDragOp: DragOp): void {
		const placement = options.placements.get(nextDragOp.id);
		if (!placement) {
			return;
		}
		dragOp = nextDragOp;
		moved = false;
		pointerId = event.pointerId;
		canvas.setPointerCapture?.(event.pointerId);
	}

	function beginHandleDrag(
		canvas: HTMLCanvasElement,
		event: PointerEvent,
		placement: Placement,
		handle: PlacementHandle,
		point: Vector
	): void {
		const transform = placement.transform;
		if (handle.type === 'scale') {
			const { cx, cy, scaleX, scaleY, rotationDeg } = transform;
			const angle = (rotationDeg ?? 0) * (Math.PI / 180);
			const cos = Math.cos(angle);
			const sin = Math.sin(angle);
			const hx = scaleX / 2;
			const hy = scaleY / 2;
			const local = toLocalPoint(transform, point);
			const lxSign = local.x >= 0 ? 1 : -1;
			const lySign = local.y >= 0 ? 1 : -1;
			const anchorX = cx - lxSign * hx * cos + lySign * hy * sin;
			const anchorY = cy - lxSign * hx * sin - lySign * hy * cos;
			const startDirX = point.x - anchorX;
			const startDirY = point.y - anchorY;
			const startDistance = Math.max(1, Math.hypot(startDirX, startDirY));
			beginDrag(canvas, event, {
				type: 'scale',
				id: placement.id,
				startDistance,
				startScaleX: scaleX,
				startScaleY: scaleY,
				lxSign,
				lySign,
				startDirX,
				startDirY,
				anchorX,
				anchorY
			});
		} else if (handle.type === 'elongate-y-top') {
			const { cx, cy, scaleY, rotationDeg } = transform;
			const angle = (rotationDeg ?? 0) * (Math.PI / 180);
			beginDrag(canvas, event, {
				type: 'elongate-y-top',
				id: placement.id,
				baseX: cx - (scaleY / 2) * Math.sin(angle),
				baseY: cy + (scaleY / 2) * Math.cos(angle)
			});
		} else if (handle.type === 'elongate-x') {
			const { cx, cy, scaleX, rotationDeg } = transform;
			const angle = (rotationDeg ?? 0) * (Math.PI / 180);
			const anchorX = cx - (scaleX / 2) * Math.cos(angle);
			const anchorY = cy - (scaleX / 2) * Math.sin(angle);
			const startDirX = point.x - anchorX;
			const startDirY = point.y - anchorY;
			beginDrag(canvas, event, {
				type: 'elongate-x',
				id: placement.id,
				anchorX,
				anchorY,
				startDistance: Math.max(1, Math.hypot(startDirX, startDirY)),
				startDirX,
				startDirY,
				startScaleX: scaleX
			});
		} else if (handle.type === 'elongate-x-left') {
			const { cx, cy, scaleX, rotationDeg } = transform;
			const angle = (rotationDeg ?? 0) * (Math.PI / 180);
			const anchorX = cx + (scaleX / 2) * Math.cos(angle);
			const anchorY = cy + (scaleX / 2) * Math.sin(angle);
			const startDirX = point.x - anchorX;
			const startDirY = point.y - anchorY;
			beginDrag(canvas, event, {
				type: 'elongate-x-left',
				id: placement.id,
				anchorX,
				anchorY,
				startDistance: Math.max(1, Math.hypot(startDirX, startDirY)),
				startDirX,
				startDirY,
				startScaleX: scaleX
			});
		} else if (handle.type === 'elongate-y') {
			const { cx, cy, scaleY, rotationDeg } = transform;
			const angle = (rotationDeg ?? 0) * (Math.PI / 180);
			const anchorX = cx + (scaleY / 2) * Math.sin(angle);
			const anchorY = cy - (scaleY / 2) * Math.cos(angle);
			const startDirX = point.x - anchorX;
			const startDirY = point.y - anchorY;
			beginDrag(canvas, event, {
				type: 'elongate-y',
				id: placement.id,
				anchorX,
				anchorY,
				startDistance: Math.max(1, Math.hypot(startDirX, startDirY)),
				startDirX,
				startDirY,
				startScaleY: scaleY
			});
		} else if (handle.type === 'rotate') {
			beginDrag(canvas, event, { type: 'rotate', id: placement.id });
		}
	}

	function updateDrag(point: Vector): void {
		if (!dragOp) {
			return;
		}
		const placement = options.placements.get(dragOp.id);
		if (!placement) {
			return;
		}
		const transform = placement.transform;
		let patch: Partial<PlacementTransform> | null = null;

		if (dragOp.type === 'move') {
			patch = {
				cx: transform.cx + (point.x - dragOp.last.x),
				cy: transform.cy + (point.y - dragOp.last.y)
			};
			dragOp.last = point;
		} else if (dragOp.type === 'scale') {
			const factor = Math.max(
				0.01,
				((point.x - dragOp.anchorX) * dragOp.startDirX +
					(point.y - dragOp.anchorY) * dragOp.startDirY) /
					(dragOp.startDistance * dragOp.startDistance)
			);
			const scaleX = clampShapeSize(dragOp.startScaleX * factor);
			const scaleY = clampShapeSize(dragOp.startScaleY * factor);
			const angle = (transform.rotationDeg ?? 0) * (Math.PI / 180);
			patch = {
				scaleX,
				scaleY,
				cx:
					dragOp.anchorX +
					dragOp.lxSign * (scaleX / 2) * Math.cos(angle) -
					dragOp.lySign * (scaleY / 2) * Math.sin(angle),
				cy:
					dragOp.anchorY +
					dragOp.lxSign * (scaleX / 2) * Math.sin(angle) +
					dragOp.lySign * (scaleY / 2) * Math.cos(angle)
			};
		} else if (dragOp.type === 'elongate-x') {
			const factor = Math.max(
				0.01,
				((point.x - dragOp.anchorX) * dragOp.startDirX +
					(point.y - dragOp.anchorY) * dragOp.startDirY) /
					(dragOp.startDistance * dragOp.startDistance)
			);
			const scaleX = clampShapeSize(dragOp.startScaleX * factor);
			const angle = (transform.rotationDeg ?? 0) * (Math.PI / 180);
			patch = {
				scaleX,
				cx: dragOp.anchorX + (scaleX / 2) * Math.cos(angle),
				cy: dragOp.anchorY + (scaleX / 2) * Math.sin(angle)
			};
		} else if (dragOp.type === 'elongate-x-left') {
			const factor = Math.max(
				0.01,
				((point.x - dragOp.anchorX) * dragOp.startDirX +
					(point.y - dragOp.anchorY) * dragOp.startDirY) /
					(dragOp.startDistance * dragOp.startDistance)
			);
			const scaleX = clampShapeSize(dragOp.startScaleX * factor);
			const angle = (transform.rotationDeg ?? 0) * (Math.PI / 180);
			patch = {
				scaleX,
				cx: dragOp.anchorX - (scaleX / 2) * Math.cos(angle),
				cy: dragOp.anchorY - (scaleX / 2) * Math.sin(angle)
			};
		} else if (dragOp.type === 'elongate-y') {
			const factor = Math.max(
				0.01,
				((point.x - dragOp.anchorX) * dragOp.startDirX +
					(point.y - dragOp.anchorY) * dragOp.startDirY) /
					(dragOp.startDistance * dragOp.startDistance)
			);
			const scaleY = clampShapeSize(dragOp.startScaleY * factor);
			const angle = (transform.rotationDeg ?? 0) * (Math.PI / 180);
			patch = {
				scaleY,
				cx: dragOp.anchorX - (scaleY / 2) * Math.sin(angle),
				cy: dragOp.anchorY + (scaleY / 2) * Math.cos(angle)
			};
		} else if (dragOp.type === 'elongate-y-top') {
			const angle = (transform.rotationDeg ?? 0) * (Math.PI / 180);
			const scaleY = clampShapeSize(
				(dragOp.baseX - point.x) * -Math.sin(angle) + (dragOp.baseY - point.y) * Math.cos(angle)
			);
			patch = {
				scaleY,
				cx: dragOp.baseX + (scaleY / 2) * Math.sin(angle),
				cy: dragOp.baseY - (scaleY / 2) * Math.cos(angle)
			};
		} else if (dragOp.type === 'rotate') {
			patch = { rotationDeg: rotationDegToPoint(transform, point) };
		}

		if (patch) {
			options.placements.update(dragOp.id, patch);
			options.onChange();
			moved = true;
		}
	}

	const attach: Attachment<HTMLCanvasElement> = (canvas) => {
		const updateDisplayScale = () => {
			const rect = canvas.getBoundingClientRect();
			cssToCanvas = rect.width > 0 ? Math.max(1, canvas.width / rect.width) : 1;
		};
		updateDisplayScale();
		const resizeObserver = new ResizeObserver(updateDisplayScale);
		resizeObserver.observe(canvas);

		function handleHitRadius(event: PointerEvent): number {
			return (
				HANDLE_HIT_RADIUS * cssToCanvas * (event.pointerType === 'touch' ? TOUCH_HIT_SCALE : 1)
			);
		}

		/** What the pointer rests over, hit-tested in the order a press would resolve. */
		function hoverAt(event: PointerEvent): ArrangeHover | null {
			const point = canvasPointFromEvent(event, canvas);
			const selected = selectedPlacement();
			if (selected) {
				const handle = hitTestHandles(
					selected,
					point,
					handleHitRadius(event),
					ROTATE_HANDLE_OFFSET
				);
				if (handle) {
					return handle.type === 'rotate'
						? { over: 'rotate' }
						: {
								over: 'resize',
								dirX: handle.x - selected.transform.cx,
								dirY: handle.y - selected.transform.cy
							};
				}
			}
			return hitPlacement(point) ? { over: 'body' } : null;
		}

		function handlePointerDown(event: PointerEvent): void {
			if (!active || (event.button !== undefined && event.button !== 0)) {
				return;
			}
			event.preventDefault();
			const point = canvasPointFromEvent(event, canvas);

			const selected = selectedPlacement();
			if (selected) {
				const handle = hitTestHandles(
					selected,
					point,
					handleHitRadius(event),
					ROTATE_HANDLE_OFFSET
				);
				if (handle) {
					beginHandleDrag(canvas, event, selected, handle, point);
					return;
				}
			}

			const hit = hitPlacement(point);
			if (hit) {
				options.setSelectedId(hit.id);
				beginDrag(canvas, event, { type: 'move', id: hit.id, last: point });
				return;
			}

			if (options.hasArmedShape()) {
				const placed = options.placeArmedShape(point);
				if (placed) {
					beginDrag(canvas, event, { type: 'move', id: placed, last: point });
				}
				return;
			}

			options.setSelectedId(null);
		}

		function handlePointerMove(event: PointerEvent): void {
			if (!active) {
				return;
			}
			// Between drags the move is only worth a hit-test, so the cursor can name
			// the handle under the pointer before it is pressed.
			if (!dragOp) {
				options.onHoverChange(hoverAt(event));
				return;
			}
			if (pointerId !== event.pointerId) {
				return;
			}
			event.preventDefault();
			updateDrag(canvasPointFromEvent(event, canvas));
		}

		function handlePointerUp(event: PointerEvent): void {
			if (!dragOp || pointerId !== event.pointerId) {
				return;
			}
			event.preventDefault();
			canvas.releasePointerCapture?.(event.pointerId);
			const changed = moved;
			dragOp = null;
			pointerId = null;
			moved = false;
			options.onChange();
			options.onHoverChange(hoverAt(event));
			if (changed) {
				options.onInteractionEnd();
			}
		}

		function handlePointerLeave(): void {
			options.onHoverChange(null);
		}

		canvas.addEventListener('pointerdown', handlePointerDown);
		canvas.addEventListener('pointermove', handlePointerMove);
		canvas.addEventListener('pointerup', handlePointerUp);
		canvas.addEventListener('pointercancel', handlePointerUp);
		canvas.addEventListener('pointerleave', handlePointerLeave);

		return () => {
			resizeObserver.disconnect();
			canvas.removeEventListener('pointerdown', handlePointerDown);
			canvas.removeEventListener('pointermove', handlePointerMove);
			canvas.removeEventListener('pointerup', handlePointerUp);
			canvas.removeEventListener('pointercancel', handlePointerUp);
			canvas.removeEventListener('pointerleave', handlePointerLeave);
		};
	};

	return {
		attach,
		setActive(nextActive) {
			active = nextActive;
			if (!active) {
				dragOp = null;
				pointerId = null;
				moved = false;
				options.onHoverChange(null);
			}
		}
	};
}
