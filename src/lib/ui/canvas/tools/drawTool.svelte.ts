import { canvasPointFromEvent, shouldKeepPoint } from '../../../input/pointerNormalizer.js';
import type { Point, PointerType, Stroke } from '../../../types.js';
import { makeStrokeEntity, renderStrokeInk } from '../entities/strokeEntity.js';

import type { Attachment } from 'svelte/attachments';
import { CONFIG } from '../../../config.js';
import { gachaStore } from '../../../gachaStore.svelte.js';
import { pathLength } from '../../../utils/geometry.js';
import type { CanvasBehavior } from '../canvasBehavior.js';
import { addEntity } from '../commands.js';
import type { Scene } from '../scene.svelte.js';

export interface DrawTool extends CanvasBehavior {
	getCurrentStroke(): Stroke | null;
}

/** The in-progress stroke is drawn fainter than committed ink. */
const PREVIEW_ALPHA = 0.72;

/**
 * Captures freehand pointer input and commits each finished stroke to the scene as a
 * `StrokeEntity` via an `addEntity` command, so it joins the shared undo history. The
 * in-progress stroke is drawn as a transient overlay through {@link CanvasBehavior.render}.
 */
export function createDrawTool(scene: Scene): DrawTool {
	let current = $state<Point[]>([]);
	let committed = 0;

	function getCurrentStroke(): Stroke | null {
		if (current.length === 0) {
			return null;
		}
		return { id: 'preview', points: current.map((point) => ({ ...point })) };
	}

	const attach: Attachment<HTMLCanvasElement> = (canvas) => {
		let pointerId: number | null = null;
		let currentPointerType: PointerType = 'unknown';

		function handlePointerDown(event: PointerEvent): void {
			if (event.button !== undefined && event.button !== 0) {
				return;
			}
			event.preventDefault();
			pointerId = event.pointerId;
			currentPointerType =
				event.pointerType === 'pen' ||
				event.pointerType === 'touch' ||
				event.pointerType === 'mouse'
					? event.pointerType
					: 'unknown';
			canvas.setPointerCapture?.(event.pointerId);
			current = [canvasPointFromEvent(event, canvas)];
		}

		function handlePointerMove(event: PointerEvent): void {
			if (pointerId !== event.pointerId) {
				return;
			}
			event.preventDefault();
			const point = canvasPointFromEvent(event, canvas);
			if (shouldKeepPoint(current, point, CONFIG.input.minPointDistance)) {
				current = [...current, point];
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
				const now = performance.now();
				const stroke: Stroke = {
					id: `s${(committed += 1)}`,
					points: points.map((point) => ({ ...point })),
					startedAt: points[0]?.t ?? now,
					endedAt: points[points.length - 1]?.t ?? now,
					pointerType: currentPointerType
				};
				scene.do(addEntity(scene, makeStrokeEntity(stroke)));
			}
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
		getCurrentStroke,
		render(ctx) {
			const preview = getCurrentStroke();
			if (preview) {
				const color = gachaStore.activeInkColor ?? CONFIG.renderer.inkColor;
				renderStrokeInk(ctx, preview, PREVIEW_ALPHA, color);
			}
		}
	};
}
