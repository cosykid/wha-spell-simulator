import { CONFIG } from '$config';
import { createPlacementPointMapper, hitTestPlacement } from '$lib/input/shapeBaker.js';
import type { Placement, Vector } from '$lib/types.js';
import type { TransformableEntity } from '../entity.js';

const INK_LINE_WIDTH = 4.4;
const COMMITTED_ALPHA = 0.94;

/**
 * Trace and stroke a placement directly from its unit-box template strokes.
 *
 * Recognition still bakes placements to Stroke[] when it recomputes; live
 * rendering uses this entity path so arrange-mode drags do not allocate baked
 * stroke snapshots every frame.
 */
export function renderPlacementInk(
	ctx: CanvasRenderingContext2D,
	placement: Placement,
	alpha = COMMITTED_ALPHA,
	color = CONFIG.renderer.inkColor,
	lineWidth = INK_LINE_WIDTH
): void {
	ctx.save();
	ctx.strokeStyle = color;
	ctx.lineWidth = lineWidth;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.globalAlpha = alpha;

	const toCanvas = createPlacementPointMapper(placement.transform);
	for (const points of placement.baseStrokes) {
		if (points.length === 0) {
			continue;
		}

		const [first, ...rest] = points;
		const start = toCanvas(first);
		ctx.beginPath();
		ctx.moveTo(start.x, start.y);
		for (const point of rest) {
			const canvasPoint = toCanvas(point);
			ctx.lineTo(canvasPoint.x, canvasPoint.y);
		}
		ctx.stroke();
	}

	ctx.restore();
}

export interface PlacementEntity extends TransformableEntity {
	placement: Placement;
}

export function makePlacementEntity(placement: Placement, z = 10): PlacementEntity {
	return {
		id: placement.id,
		z,
		placement,
		render(ctx) {
			renderPlacementInk(ctx, this.placement);
		},
		hitTest(point: Vector) {
			return hitTestPlacement(this.placement, point);
		},
		scale(scaleX, scaleY) {
			const { transform } = this.placement;
			transform.cx *= scaleX;
			transform.cy *= scaleY;
			transform.scaleX *= scaleX;
			transform.scaleY *= scaleY;
		}
	};
}
