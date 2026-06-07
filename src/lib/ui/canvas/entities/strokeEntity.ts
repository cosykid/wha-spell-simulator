import { CONFIG } from '$config';
import type { Stroke } from '../../../types.js';
import type { Entity } from '../entity.js';

export interface StrokeEntity extends Entity {
	readonly stroke: Stroke;
}

const INK_LINE_WIDTH = 4.4;
const COMMITTED_ALPHA = 0.94;

/**
 * Trace and stroke a single ink path. This is the canvas drawing that used to live in
 * `drawStrokes`/`drawSingleStroke`; it now belongs to the stroke entity and is shared by
 * the symbol entity and the draw-tool preview so there is one source of truth for ink.
 */
export function renderStrokeInk(
	ctx: CanvasRenderingContext2D,
	stroke: Stroke,
	alpha = COMMITTED_ALPHA,
	color = CONFIG.renderer.inkColor,
	lineWidth = INK_LINE_WIDTH
): void {
	if (stroke.points.length === 0) {
		return;
	}

	ctx.save();
	ctx.strokeStyle = color;
	ctx.lineWidth = lineWidth;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.globalAlpha = alpha;

	const [first, ...rest] = stroke.points;
	ctx.beginPath();
	ctx.moveTo(first.x, first.y);
	for (const point of rest) {
		ctx.lineTo(point.x, point.y);
	}
	ctx.stroke();
	ctx.restore();
}

/**
 * One committed freehand stroke. Each stroke is its own entity so it participates
 * in the scene's shared undo history alongside symbols.
 */
export function makeStrokeEntity(stroke: Stroke, z = 0): StrokeEntity {
	return {
		id: stroke.id,
		z,
		stroke,
		render(ctx) {
			renderStrokeInk(ctx, stroke);
		},
		scale(scaleX, scaleY) {
			for (const point of stroke.points) {
				point.x *= scaleX;
				point.y *= scaleY;
			}
		}
	};
}

/**
 * Check if an Entity is a StrokeEntity.
 */
export function isStrokeEntity(entity: { id: string }): entity is StrokeEntity {
	return 'stroke' in entity;
}
