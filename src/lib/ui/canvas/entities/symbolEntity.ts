import { loadSymbolBaseStrokes, type SymbolRenderPath } from '../../../dictionary/svgStrokes.js';
import { hitTestPlacement } from '../../../input/shapeBaker.js';
import type { Placement, Point, Vector } from '../../../types.js';

import type { TransformableEntity } from '../entity.js';

// A placed symbol draws in magenta rather than ink so it stays distinct from the
// strokes around it. Multiply blending turns it near-black where the two cross,
// which is what makes a misplacement easy to see. The Sample Reviewer's overlay
// takes the same hue for the same reason.
const LABEL_COLOR = '#d068f0';
const LABEL_ALPHA = 0.82;
const DEFAULT_LINE_WIDTH = 7;

/**
 * A symbol entity carries both a faithful render path and a sampled point cloud, each
 * for a different job:
 *
 * - **Rendering** draws the original SVG `<path>` via {@link Path2D}, so curves and sharp
 *   corners are preserved. The whole glyph is stroked in a single operation, so overlapping
 *   subpaths blend against the background exactly once — no double-darkening from the
 *   semi-transparent ink.
 * - **The placement optimizer** still needs a `Point[][]` cloud; that is sampled lazily by
 *   {@link SymbolEntity.getBaseStrokes} only if the user actually runs a fit.
 * - **Hit-testing** uses the placement's bounding box, so it needs neither.
 *
 * The render matrix is the exact composition of the unit-box mapping in `svgStrokes`
 * (`samplePath`) and `bakePlacementToStrokes`, so the drawn glyph and the sampled cloud
 * stay pixel-aligned.
 */
export interface SymbolEntity extends TransformableEntity {
	/** Sample the glyph into unit-box strokes for the optimizer. Memoized after first call. */
	getBaseStrokes(): Point[][];
}

export function isSymbolEntity(entity: { id: string }): entity is SymbolEntity {
	return 'getBaseStrokes' in entity;
}

export function makeSymbolEntity(
	placement: Placement,
	svg: SymbolRenderPath,
	z = 10,
	lineWidth = DEFAULT_LINE_WIDTH
): SymbolEntity {
	const span = Math.max(svg.width, svg.height) || 1;
	// Built once; the placement transform is applied per-frame as a separate DOMMatrix.
	const glyphPath = new Path2D(svg.d);

	return {
		id: placement.id,
		z,
		placement,
		render(ctx) {
			const { transform } = this.placement;
			// Compose SVG-space → canvas-space: center the glyph, scale into the placement box,
			// rotate, then translate to the placement center. Mirrors samplePath ∘ bake.
			const matrix = new DOMMatrix()
				.translateSelf(transform.cx, transform.cy)
				.rotateSelf(transform.rotationDeg ?? 0)
				.scaleSelf(transform.scaleX / span, transform.scaleY / span)
				.translateSelf(-svg.width / 2, -svg.height / 2);

			// Bake the matrix into the path so the line width stays uniform under anisotropic scale.
			const canvasPath = new Path2D();
			canvasPath.addPath(glyphPath, matrix);

			ctx.save();
			ctx.globalCompositeOperation = 'multiply';
			ctx.globalAlpha = LABEL_ALPHA;
			ctx.strokeStyle = LABEL_COLOR;
			ctx.lineWidth = lineWidth;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
			ctx.stroke(canvasPath);
			ctx.restore();
		},
		hitTest(point: Vector) {
			return hitTestPlacement(this.placement, point);
		},
		getBaseStrokes() {
			if (this.placement.baseStrokes.length === 0) {
				this.placement.baseStrokes = loadSymbolBaseStrokes(this.placement.sourceId);
			}
			return this.placement.baseStrokes;
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
