import { bakePlacementToStrokes, hitTestPlacement } from '../../../input/shapeBaker.js';
import type { Placement, Vector } from '../../../types.js';

import type { TransformableEntity } from '../entity.js';
import { renderStrokeInk } from './strokeEntity.js';

// Teal accent color for the label overlay; matches the active-label highlight in the UI.
const LABEL_COLOR = '#d068f0';
const LABEL_ALPHA = 0.82;

/**
 * A symbol: a group of strokes carried by a {@link Placement}, drawn and hit-tested
 * as a single unit. Reuses the existing `shapeBaker` geometry so it transforms (move,
 * rotate, scale) exactly like the legacy placements on the main page.
 *
 * Rendered in a distinct teal with `multiply` blending so it appears colored on the white
 * background and turns near-black where it overlaps the user's ink strokes — making it easy
 * to see misalignment.
 */
export function makeSymbolEntity(
	placement: Placement,
	z = 10,
	lineWidth?: number
): TransformableEntity {
	return {
		id: placement.id,
		z,
		placement,
		render(ctx) {
			ctx.save();
			ctx.globalCompositeOperation = 'multiply';
			for (const stroke of bakePlacementToStrokes(this.placement)) {
				renderStrokeInk(ctx, stroke, LABEL_ALPHA, LABEL_COLOR, lineWidth);
			}
			ctx.restore();
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
