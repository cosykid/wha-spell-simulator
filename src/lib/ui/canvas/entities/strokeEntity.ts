import { CONFIG } from '$config';
import type { Stroke } from '../../../types.js';
import type { Entity } from '../entity.js';
import { inkRibbonFor, traceInkRibbon } from './inkRibbon.js';

/**
 * Canvas pixels; the ink's nominal weight. A mark's own pace and its landing
 * and lift move the real width around this, so it is the weight the ink
 * averages rather than the width it holds. Layers drawn over the ink state
 * their own widths at this scale.
 */
export const INK_NOMINAL_WIDTH = 4.4;

/** Ink that has been committed reads a touch heavier than the stroke in flight. */
export const COMMITTED_ALPHA = 0.94;

export interface StrokeEntity extends Entity {
	readonly stroke: Stroke;
}

/**
 * Fill a single mark of ink. This is shared by the main renderer, the stroke
 * entity, and the draw-tool preview so there is one source of truth for ink.
 *
 * `weight` is what the mark averages, not its width along the whole of it:
 * [`inkRibbon.ts`](inkRibbon.ts) reads how fast the hand was moving and where
 * the brush landed and lifted, and shapes the mark around that.
 */
export function renderStrokeInk(
	ctx: CanvasRenderingContext2D,
	stroke: Stroke,
	alpha = COMMITTED_ALPHA,
	color = CONFIG.renderer.inkColor,
	weight = INK_NOMINAL_WIDTH
): void {
	if (stroke.points.length < 2) {
		return;
	}

	ctx.save();
	ctx.fillStyle = color;
	ctx.globalAlpha = alpha;
	ctx.beginPath();

	const ribbon = inkRibbonFor(stroke.points, weight);
	if (ribbon) {
		traceInkRibbon(ctx, ribbon);
	} else {
		// A pointer that pressed and never travelled still leaves a dot, the
		// way the round cap this replaced did.
		const [first] = stroke.points;
		ctx.arc(first.x, first.y, weight / 2, 0, Math.PI * 2);
	}

	ctx.fill();
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
