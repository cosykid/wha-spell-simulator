import type { Placement, Vector } from '../../../types.js';
import { bakePlacementToStrokes, hitTestPlacement } from '../../../input/shapeBaker.js';

import type { TransformableEntity } from '../entity.js';
import { renderStrokeInk } from './strokeEntity.js';

/**
 * A symbol: a group of strokes carried by a {@link Placement}, drawn and hit-tested
 * as a single unit. Reuses the existing `shapeBaker` geometry so it transforms (move,
 * rotate, scale) exactly like the legacy placements on the main page.
 */
export function makeSymbolEntity(placement: Placement, z = 10): TransformableEntity {
	return {
		id: placement.id,
		z,
		placement,
		render(ctx) {
			// Bake the unit-box template into canvas-space strokes, then ink each one.
			for (const stroke of bakePlacementToStrokes(this.placement)) {
				renderStrokeInk(ctx, stroke);
			}
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
