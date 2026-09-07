import { CONFIG } from '$config';
import { createPlacementPointMapper, hitTestPlacement } from '$lib/input/shapeBaker.js';
import type { Placement, Vector } from '$lib/types.js';
import type { TransformableEntity } from '../entity.js';
import { buildInkRibbon, traceInkRibbon } from './inkRibbon.js';
import { COMMITTED_ALPHA, INK_NOMINAL_WIDTH } from './strokeEntity.js';

/**
 * Fill a placement directly from its unit-box template strokes, in the same
 * pen the freehand ink uses: a stamped symbol should not read as a different
 * instrument beside a drawn one. Template points carry no clock, so these
 * marks take the landing and lift and hold an even width between them.
 *
 * Recognition still bakes placements to Stroke[] when it recomputes; live
 * rendering uses this entity path so arrange-mode drags do not allocate baked
 * stroke snapshots every frame. The mapped points are new every frame too,
 * which is why this builds its marks rather than reading the ribbon cache.
 */
export function renderPlacementInk(
	ctx: CanvasRenderingContext2D,
	placement: Placement,
	alpha = COMMITTED_ALPHA,
	color = CONFIG.renderer.inkColor,
	weight = INK_NOMINAL_WIDTH
): void {
	ctx.save();
	ctx.fillStyle = color;
	ctx.globalAlpha = alpha;
	ctx.beginPath();

	const toCanvas = createPlacementPointMapper(placement.transform);
	for (const points of placement.baseStrokes) {
		const ribbon = buildInkRibbon(points.map(toCanvas), weight);
		if (ribbon) {
			traceInkRibbon(ctx, ribbon);
		}
	}

	ctx.fill();
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
