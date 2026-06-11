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
	drawHandleSquare(ctx, handles.topMid);

	ctx.beginPath();
	ctx.arc(handles.rotate.x, handles.rotate.y, ROTATE_HANDLE_RADIUS, 0, Math.PI * 2);
	ctx.fill();
	ctx.stroke();
	ctx.restore();
}

type DragOp =
	| { type: 'move'; last: Vector }
	| {
			type: 'scale';
			startDistance: number;
			startScaleX: number;
			startScaleY: number;
			/** Local-space sign of the dragged corner: +1 or -1 on each axis. */
			lxSign: number;
			lySign: number;
			/** Canvas-space direction vector from anchor to start point (not normalised). */
			startDirX: number;
			startDirY: number;
			/** Canvas-space position of the opposite corner, held fixed during the scale gesture. */
			anchorX: number;
			anchorY: number;
	  }
	| {
			type: 'elongate-x';
			anchorX: number;
			anchorY: number;
			startDistance: number;
			startDirX: number;
			startDirY: number;
			startScaleX: number;
	  }
	| {
			type: 'elongate-x-left';
			anchorX: number;
			anchorY: number;
			startDistance: number;
			startDirX: number;
			startDirY: number;
			startScaleX: number;
	  }
	| {
			type: 'elongate-y';
			anchorX: number;
			anchorY: number;
			startDistance: number;
			startDirX: number;
			startDirY: number;
			startScaleY: number;
	  }
	| { type: 'elongate-y-top'; baseX: number; baseY: number }
	| { type: 'rotate' };

/**
 * Two-finger pinch gesture: scale + rotate + translate the selected entity.
 * All positions are in canvas coordinate space (via canvasPointFromEvent).
 */
type PinchOp = {
	p1Id: number;
	p2Id: number;
	p1: Vector;
	p2: Vector;
	startMidX: number;
	startMidY: number;
	startDist: number;
	startAngleDeg: number;
	startScaleX: number;
	startScaleY: number;
	startRotDeg: number;
	startCx: number;
	startCy: number;
};

export interface SelectTool extends CanvasBehavior {
	getSelectedId(): string | null;
	/** Programmatically select an entity by id (pass null to deselect). */
	setSelectedId(id: string | null): void;
}

/**
 * Selects and transforms {@link TransformableEntity} entities (symbols) with the same
 * move/scale/elongate/rotate handles the legacy `PlacementController` uses — reusing
 * `shapeBaker`'s hit-testing and handle geometry. A whole drag gesture is committed to
 * the scene as a single `transformEntity` command, so one undo reverses the gesture.
 *
 * On touch devices, two simultaneous fingers apply a pinch (scale) + rotation +
 * translation gesture directly to the selected entity, bypassing the small handles.
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
		// Last canvas-space position of the primary finger (for pinch initiation).
		let lastPrimaryPoint: Vector | null = null;

		// Two-finger pinch state for touch-based symbol transform.
		let pinchOp: PinchOp | null = null;
		let pinchBefore: PlacementTransform | null = null;

		function beginDrag(event: PointerEvent, entity: TransformableEntity, op: DragOp): void {
			target = entity;
			before = { ...entity.placement.transform };
			dragOp = op;
			moved = false;
			pointerId = event.pointerId;
			lastPrimaryPoint = op.type === 'move' ? op.last : null;
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
				const { cx, cy, scaleX, scaleY, rotationDeg } = transform;
				const angle = (rotationDeg ?? 0) * (Math.PI / 180);
				const cos = Math.cos(angle);
				const sin = Math.sin(angle);
				const hx = scaleX / 2;
				const hy = scaleY / 2;
				// Determine which corner was hit by converting to local space.
				const local = toLocalPoint(transform, point);
				const lxSign = local.x >= 0 ? 1 : -1;
				const lySign = local.y >= 0 ? 1 : -1;
				// Opposite corner in canvas space — stays fixed during the scale gesture.
				const anchorX = cx - lxSign * hx * cos + lySign * hy * sin;
				const anchorY = cy - lxSign * hx * sin - lySign * hy * cos;
				const startDirX = point.x - anchorX;
				const startDirY = point.y - anchorY;
				const startDistance = Math.max(1, Math.sqrt(startDirX * startDirX + startDirY * startDirY));
				beginDrag(event, entity, {
					type: 'scale',
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
				const cos = Math.cos(angle);
				const sin = Math.sin(angle);
				beginDrag(event, entity, {
					type: 'elongate-y-top',
					// Bottom-center of the symbol in canvas space; stays fixed during top-drag.
					baseX: cx - (scaleY / 2) * sin,
					baseY: cy + (scaleY / 2) * cos
				});
			} else if (handle.type === 'elongate-x') {
				const { cx, cy, scaleX, rotationDeg } = transform;
				const angle = (rotationDeg ?? 0) * (Math.PI / 180);
				const cos = Math.cos(angle);
				const sin = Math.sin(angle);
				// Anchor = left-mid (opposite of right-mid).
				const anchorX = cx - (scaleX / 2) * cos;
				const anchorY = cy - (scaleX / 2) * sin;
				const startDirX = point.x - anchorX;
				const startDirY = point.y - anchorY;
				beginDrag(event, entity, {
					type: 'elongate-x',
					anchorX,
					anchorY,
					startDistance: Math.max(1, Math.sqrt(startDirX * startDirX + startDirY * startDirY)),
					startDirX,
					startDirY,
					startScaleX: scaleX
				});
			} else if (handle.type === 'elongate-x-left') {
				const { cx, cy, scaleX, rotationDeg } = transform;
				const angle = (rotationDeg ?? 0) * (Math.PI / 180);
				const cos = Math.cos(angle);
				const sin = Math.sin(angle);
				// Anchor = right-mid (opposite of left-mid).
				const anchorX = cx + (scaleX / 2) * cos;
				const anchorY = cy + (scaleX / 2) * sin;
				const startDirX = point.x - anchorX;
				const startDirY = point.y - anchorY;
				beginDrag(event, entity, {
					type: 'elongate-x-left',
					anchorX,
					anchorY,
					startDistance: Math.max(1, Math.sqrt(startDirX * startDirX + startDirY * startDirY)),
					startDirX,
					startDirY,
					startScaleX: scaleX
				});
			} else if (handle.type === 'elongate-y') {
				const { cx, cy, scaleY, rotationDeg } = transform;
				const angle = (rotationDeg ?? 0) * (Math.PI / 180);
				const cos = Math.cos(angle);
				const sin = Math.sin(angle);
				// Anchor = top-mid (opposite of bottom-mid).
				const anchorX = cx + (scaleY / 2) * sin;
				const anchorY = cy - (scaleY / 2) * cos;
				const startDirX = point.x - anchorX;
				const startDirY = point.y - anchorY;
				beginDrag(event, entity, {
					type: 'elongate-y',
					anchorX,
					anchorY,
					startDistance: Math.max(1, Math.sqrt(startDirX * startDirX + startDirY * startDirY)),
					startDirX,
					startDirY,
					startScaleY: scaleY
				});
			} else {
				beginDrag(event, entity, { type: handle.type });
			}
		}

		function commitPinch(): void {
			const entity = selectedEntity();
			if (pinchOp && pinchBefore && entity) {
				const after = { ...entity.placement.transform };
				scene.do(transformEntity(entity, pinchBefore, after));
			}
			pinchOp = null;
			pinchBefore = null;
		}

		function handlePointerDown(event: PointerEvent): void {
			if (event.button !== undefined && event.button !== 0) {
				return;
			}
			event.preventDefault();
			const point = canvasPointFromEvent(event, canvas);

			// Second finger while we already have a selection → start pinch gesture.
			if (pinchOp) {
				return; // Third+ finger: ignore.
			}
			if (pointerId !== null && dragOp?.type === 'move' && selectedEntity()) {
				// Commit the current single-finger move before switching to pinch.
				if (moved && before && target) {
					const after = { ...target.placement.transform };
					scene.do(transformEntity(target, before, after));
				}
				const firstPointerId = pointerId;
				const firstPoint = lastPrimaryPoint ?? point; // fallback: second finger position
				dragOp = null;
				moved = false;
				try {
					canvas.releasePointerCapture(firstPointerId);
				} catch {
					// ignore
				}
				pointerId = null;
				target = null;
				before = null;
				lastPrimaryPoint = null;

				// Initialise pinch using both fingers' current canvas positions.
				const entity = selectedEntity()!;
				const t = entity.placement.transform;
				pinchBefore = { ...t };
				const midX = (firstPoint.x + point.x) / 2;
				const midY = (firstPoint.y + point.y) / 2;
				const dist = Math.hypot(point.x - firstPoint.x, point.y - firstPoint.y) || 1;
				pinchOp = {
					p1Id: firstPointerId,
					p2Id: event.pointerId,
					p1: firstPoint,
					p2: point,
					startMidX: midX,
					startMidY: midY,
					startDist: dist,
					startAngleDeg:
						Math.atan2(point.y - firstPoint.y, point.x - firstPoint.x) * (180 / Math.PI),
					startScaleX: t.scaleX,
					startScaleY: t.scaleY,
					startRotDeg: t.rotationDeg ?? 0,
					startCx: t.cx,
					startCy: t.cy
				};
				canvas.setPointerCapture?.(event.pointerId);
				return;
			}

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
			// Pinch gesture: update the moving finger's position and recompute transform.
			if (pinchOp) {
				if (event.pointerId !== pinchOp.p1Id && event.pointerId !== pinchOp.p2Id) {
					return;
				}
				const pt = canvasPointFromEvent(event, canvas);
				if (event.pointerId === pinchOp.p1Id) {
					pinchOp.p1 = pt;
				} else {
					pinchOp.p2 = pt;
				}

				const entity = selectedEntity();
				if (!entity) return;

				const { p1, p2 } = pinchOp;
				const newMidX = (p1.x + p2.x) / 2;
				const newMidY = (p1.y + p2.y) / 2;
				const newDist = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
				const newAngleDeg = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);

				const scaleFactor = newDist / pinchOp.startDist;
				const rotChange = newAngleDeg - pinchOp.startAngleDeg;
				const midDx = newMidX - pinchOp.startMidX;
				const midDy = newMidY - pinchOp.startMidY;

				entity.placement.transform.scaleX = clampShapeSize(pinchOp.startScaleX * scaleFactor);
				entity.placement.transform.scaleY = clampShapeSize(pinchOp.startScaleY * scaleFactor);
				entity.placement.transform.rotationDeg = pinchOp.startRotDeg + rotChange;
				entity.placement.transform.cx = pinchOp.startCx + midDx;
				entity.placement.transform.cy = pinchOp.startCy + midDy;
				return;
			}

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
				const {
					startDistance,
					startScaleX,
					startScaleY,
					lxSign,
					lySign,
					startDirX,
					startDirY,
					anchorX,
					anchorY
				} = dragOp;
				// Project pointer onto the start direction to get the scale factor.
				const pointerFromAnchorX = point.x - anchorX;
				const pointerFromAnchorY = point.y - anchorY;
				const factor = Math.max(
					0.01,
					(pointerFromAnchorX * startDirX + pointerFromAnchorY * startDirY) /
						(startDistance * startDistance)
				);
				const newScaleX = clampShapeSize(startScaleX * factor);
				const newScaleY = clampShapeSize(startScaleY * factor);
				const angle = (transform.rotationDeg ?? 0) * (Math.PI / 180);
				const cos = Math.cos(angle);
				const sin = Math.sin(angle);
				const newHx = newScaleX / 2;
				const newHy = newScaleY / 2;
				transform.scaleX = newScaleX;
				transform.scaleY = newScaleY;
				// Re-anchor cx/cy so the opposite corner stays fixed.
				transform.cx = anchorX + lxSign * newHx * cos - lySign * newHy * sin;
				transform.cy = anchorY + lxSign * newHx * sin + lySign * newHy * cos;
			} else if (dragOp.type === 'elongate-x') {
				const { anchorX, anchorY, startDistance, startDirX, startDirY, startScaleX } = dragOp;
				const factor = Math.max(
					0.01,
					((point.x - anchorX) * startDirX + (point.y - anchorY) * startDirY) /
						(startDistance * startDistance)
				);
				const newScaleX = clampShapeSize(startScaleX * factor);
				const angle = (transform.rotationDeg ?? 0) * (Math.PI / 180);
				transform.scaleX = newScaleX;
				// Center = anchor (left-mid) + newHx in local +X direction (cos, sin).
				transform.cx = anchorX + (newScaleX / 2) * Math.cos(angle);
				transform.cy = anchorY + (newScaleX / 2) * Math.sin(angle);
			} else if (dragOp.type === 'elongate-x-left') {
				const { anchorX, anchorY, startDistance, startDirX, startDirY, startScaleX } = dragOp;
				const factor = Math.max(
					0.01,
					((point.x - anchorX) * startDirX + (point.y - anchorY) * startDirY) /
						(startDistance * startDistance)
				);
				const newScaleX = clampShapeSize(startScaleX * factor);
				const angle = (transform.rotationDeg ?? 0) * (Math.PI / 180);
				transform.scaleX = newScaleX;
				// Center = anchor (right-mid) - newHx in local +X direction (cos, sin).
				transform.cx = anchorX - (newScaleX / 2) * Math.cos(angle);
				transform.cy = anchorY - (newScaleX / 2) * Math.sin(angle);
			} else if (dragOp.type === 'elongate-y') {
				const { anchorX, anchorY, startDistance, startDirX, startDirY, startScaleY } = dragOp;
				const factor = Math.max(
					0.01,
					((point.x - anchorX) * startDirX + (point.y - anchorY) * startDirY) /
						(startDistance * startDistance)
				);
				const newScaleY = clampShapeSize(startScaleY * factor);
				const angle = (transform.rotationDeg ?? 0) * (Math.PI / 180);
				transform.scaleY = newScaleY;
				// Center = anchor (top-mid) + newHy in local +Y direction (-sin, cos).
				transform.cx = anchorX - (newScaleY / 2) * Math.sin(angle);
				transform.cy = anchorY + (newScaleY / 2) * Math.cos(angle);
			} else if (dragOp.type === 'elongate-y-top') {
				const angle = (transform.rotationDeg ?? 0) * (Math.PI / 180);
				const cos = Math.cos(angle);
				const sin = Math.sin(angle);
				// Project (base → pointer) onto the local Y axis to get the new scaleY.
				const newScaleY = clampShapeSize(
					(dragOp.baseX - point.x) * -sin + (dragOp.baseY - point.y) * cos
				);
				transform.scaleY = newScaleY;
				transform.cx = dragOp.baseX + (newScaleY / 2) * sin;
				transform.cy = dragOp.baseY - (newScaleY / 2) * cos;
			} else if (dragOp.type === 'rotate') {
				transform.rotationDeg = rotationDegToPoint(transform, point);
			}

			lastPrimaryPoint = point;
			moved = true;
		}

		function handlePointerUp(event: PointerEvent): void {
			if (pinchOp) {
				if (event.pointerId === pinchOp.p1Id || event.pointerId === pinchOp.p2Id) {
					commitPinch();
					canvas.releasePointerCapture?.(event.pointerId);
				}
				return;
			}

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
			lastPrimaryPoint = null;
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
		setSelectedId: (id) => {
			selectedId = id;
		},
		render(ctx) {
			const selected = selectedEntity();
			if (selected) {
				drawSelection(ctx, placementHandles(selected.placement));
			}
		}
	};
}
