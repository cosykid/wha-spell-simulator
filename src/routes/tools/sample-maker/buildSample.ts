import type { Point, SampleSubmission, Stroke } from '$lib/structures/labelledSample.js';
import type { PlacementTransform, Stroke as SceneStroke } from '$lib/types.js';
import { degreesToRadians } from '$lib/utils/geometry.js';
import type { SampleSymbol } from './symbols.js';

/**
 * Pixels the reference glyph spans at "scale 1". The symbol entity is stamped at this
 * size, so `scale_x = transform.scaleX / REFERENCE_SIZE` is 1.0 until the user resizes.
 * Also reported as `meta.referenceSize` (the unit for the label's scale fields).
 */
export const REFERENCE_SIZE = 240;

export interface BuildSampleArgs {
	/** The contributor's freehand strokes, in the canvas backing-store frame. */
	strokes: SceneStroke[];
	/** The sign the contributor asserts they drew. */
	symbol: SampleSymbol;
	/** The reference glyph's measured transform. */
	transform: PlacementTransform;
	/** Backing-store size the raw coordinates live in. */
	canvasWidth: number;
	canvasHeight: number;
	devicePixelRatio: number;
}

/** Wrap an angle in degrees into radians within (-π, π]. */
function toSignedRadians(degrees: number): number {
	const twoPi = 2 * Math.PI;
	let radians = degreesToRadians(degrees) % twoPi;
	if (radians > Math.PI) {
		radians -= twoPi;
	} else if (radians <= -Math.PI) {
		radians += twoPi;
	}
	return radians;
}

/** Smallest timestamp across all strokes, used to rebase `t` so it starts at 0. */
function firstTimestamp(strokes: SceneStroke[]): number {
	let min = Infinity;
	for (const stroke of strokes) {
		for (const point of stroke.points) {
			if (typeof point.t === 'number' && point.t < min) {
				min = point.t;
			}
		}
	}
	return Number.isFinite(min) ? min : 0;
}

/**
 * Assemble a {@link SampleSubmission} from the captured strokes (the *data*) and the
 * reference glyph's measured transform (the *label*). Timestamps are rebased so the
 * first point of the first stroke is `t = 0`, per the schema.
 */
export function buildSampleSubmission(args: BuildSampleArgs): SampleSubmission {
	const { strokes, symbol, transform, canvasWidth, canvasHeight, devicePixelRatio } = args;

	const t0 = firstTimestamp(strokes);
	const data: Stroke[] = strokes.map((stroke) =>
		stroke.points.map(
			(point): Point => ({
				x: point.x,
				y: point.y,
				t: (point.t ?? t0) - t0
			})
		)
	);

	return {
		data,
		label: {
			signId: symbol.id,
			scale_x: transform.scaleX / REFERENCE_SIZE,
			scale_y: transform.scaleY / REFERENCE_SIZE,
			// Center position in the stroke frame (backing-store px); not normalized by
			// REFERENCE_SIZE since it's a position, not a size ratio.
			translate_x: transform.cx,
			translate_y: transform.cy,
			angle: toSignedRadians(transform.rotationDeg)
		},
		meta: {
			referenceSize: REFERENCE_SIZE,
			canvasWidth,
			canvasHeight,
			devicePixelRatio
		}
	};
}
