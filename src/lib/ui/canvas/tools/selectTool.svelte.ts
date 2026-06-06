import type { Attachment } from 'svelte/attachments';
import { canvasPointFromEvent } from '../../../input/pointerNormalizer.js';
import {
	clampShapeSize,
	hitTestHandles,
	placementHandles,
	rotationDegToPoint,
	toLocalPoint
} from '../../../input/shapeBaker.js';
import type {
	PlacementHandle,
	PlacementHandles,
	PlacementTransform,
	Vector
} from '../../../types.js';
import { distance } from '../../../utils/geometry.js';
import type { CanvasBehavior } from '../canvasBehavior.js';
import { transformEntity } from '../commands.js';
import { isTransformable, type TransformableEntity } from '../entity.js';
import type { Scene } from '../scene.svelte.js';

const HANDLE_SIZE = 9;
const ROTATE_HANDLE_RADIUS = 5.5;

/**
 * Draw a square handle centered on `point`. Used for both corner and edge handles.
 */
function drawHandleSquare(ctx: CanvasRenderingContext2D, point: Vector): void {
	ctx.beginPath();
	ctx.rect(point.x - HANDLE_SIZE / 2, point.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
	ctx.fill();
	ctx.stroke();
}

/**
 * Draw the selection box, transform handles, and rotate handle.
 */
function drawSelection(ctx: CanvasRenderingContext2D, handles: PlacementHandles): void {
	ctx.save();
	ctx.strokeStyle = 'rgba(31, 111, 115, 0.85)';
	ctx.fillStyle = 'rgba(255, 251, 233, 0.96)';
	ctx.lineWidth = 1.5;

	ctx.setLineDash([6, 4]);
	ctx.beginPath();
	handles.corners.forEach((corner, index) => {
		if (index === 0) {
			ctx.moveTo(corner.x, corner.y);
		} else {
			ctx.lineTo(corner.x, corner.y);
		}
	});
	ctx.closePath();
	ctx.stroke();
	ctx.setLineDash([]);

	ctx.beginPath();
	ctx.moveTo(handles.topMid.x, handles.topMid.y);
	ctx.lineTo(handles.rotate.x, handles.rotate.y);
	ctx.stroke();

	for (const corner of handles.corners) {
		drawHandleSquare(ctx, corner);
	}
	for (const edge of handles.edgeHandles) {
		drawHandleSquare(ctx, edge);
	}

	ctx.beginPath();
	ctx.arc(handles.rotate.x, handles.rotate.y, ROTATE_HANDLE_RADIUS, 0, Math.PI * 2);
	ctx.fill();
	ctx.stroke();
	ctx.restore();
}

type DragOp =
	| { type: 'move'; last: Vector }
	| { type: 'scale'; startDistance: number; startScaleX: number; startScaleY: number }
	| { type: 'elongate-x' }
	| { type: 'elongate-y' }
	| { type: 'rotate' };

export interface SelectTool extends CanvasBehavior {
	getSelectedId(): string | null;
}

/**
 * Selects and transforms {@link TransformableEntity} entities (symbols) with the same
 * move/scale/elongate/rotate handles the legacy `PlacementController` uses — reusing
 * `shapeBaker`'s hit-testing and handle geometry. A whole drag gesture is committed to
 * the scene as a single `transformEntity` command, so one undo reverses the gesture.
 */
export function createSelectTool(scene: Scene): SelectTool {
	let selectedId = $state<string | null>(null);

	function selectedEntity(): TransformableEntity | null {
		if (!selectedId) {
			return null;
		}
		const entity = scene.get(selectedId);
		return entity && isTransformable(entity) ? entity : null;
	}

	const attach: Attachment<HTMLCanvasElement> = (canvas) => {
		let dragOp: DragOp | null = null;
		let target: TransformableEntity | null = null;
		let before: PlacementTransform | null = null;
		let pointerId: number | null = null;
		let moved = false;

		function beginDrag(event: PointerEvent, entity: TransformableEntity, op: DragOp): void {
			target = entity;
			before = { ...entity.placement.transform };
			dragOp = op;
			moved = false;
			pointerId = event.pointerId;
			canvas.setPointerCapture?.(event.pointerId);
		}

		function beginHandleDrag(
			event: PointerEvent,
			entity: TransformableEntity,
			handle: PlacementHandle,
			point: Vector
		): void {
			const transform = entity.placement.transform;
			if (handle.type === 'scale') {
				const center = { x: transform.cx, y: transform.cy };
				beginDrag(event, entity, {
					type: 'scale',
					startDistance: Math.max(1, distance(center, point)),
					startScaleX: transform.scaleX,
					startScaleY: transform.scaleY
				});
			} else {
				beginDrag(event, entity, { type: handle.type });
			}
		}

		function handlePointerDown(event: PointerEvent): void {
			if (event.button !== undefined && event.button !== 0) {
				return;
			}
			event.preventDefault();
			const point = canvasPointFromEvent(event, canvas);

			const selected = selectedEntity();
			if (selected) {
				const handle = hitTestHandles(selected.placement, point);
				if (handle) {
					beginHandleDrag(event, selected, handle, point);
					return;
				}
			}

			const hit = [...scene.getEntities()]
				.reverse()
				.find(
					(entity): entity is TransformableEntity =>
						isTransformable(entity) && entity.hitTest(point)
				);
			if (hit) {
				selectedId = hit.id;
				beginDrag(event, hit, { type: 'move', last: point });
				return;
			}

			selectedId = null;
		}

		function handlePointerMove(event: PointerEvent): void {
			if (!dragOp || !target || pointerId !== event.pointerId) {
				return;
			}
			event.preventDefault();
			const point = canvasPointFromEvent(event, canvas);
			const transform = target.placement.transform;

			if (dragOp.type === 'move') {
				transform.cx += point.x - dragOp.last.x;
				transform.cy += point.y - dragOp.last.y;
				dragOp.last = point;
			} else if (dragOp.type === 'scale') {
				const center = { x: transform.cx, y: transform.cy };
				const factor = distance(center, point) / dragOp.startDistance;
				transform.scaleX = clampShapeSize(dragOp.startScaleX * factor);
				transform.scaleY = clampShapeSize(dragOp.startScaleY * factor);
			} else if (dragOp.type === 'elongate-x') {
				transform.scaleX = clampShapeSize(Math.abs(toLocalPoint(transform, point).x) * 2);
			} else if (dragOp.type === 'elongate-y') {
				transform.scaleY = clampShapeSize(Math.abs(toLocalPoint(transform, point).y) * 2);
			} else if (dragOp.type === 'rotate') {
				transform.rotationDeg = rotationDegToPoint(transform, point);
			}

			moved = true;
		}

		function handlePointerUp(event: PointerEvent): void {
			if (!dragOp || !target || pointerId !== event.pointerId) {
				return;
			}
			event.preventDefault();
			canvas.releasePointerCapture?.(event.pointerId);

			// Record the whole gesture as one undo step, but only if it actually moved.
			if (moved && before) {
				const after = { ...target.placement.transform };
				scene.do(transformEntity(target, before, after));
			}

			dragOp = null;
			target = null;
			before = null;
			pointerId = null;
			moved = false;
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

	return {
		attach,
		getSelectedId: () => selectedId,
		render(ctx) {
			const selected = selectedEntity();
			if (selected) {
				drawSelection(ctx, placementHandles(selected.placement));
			}
		}
	};
}
