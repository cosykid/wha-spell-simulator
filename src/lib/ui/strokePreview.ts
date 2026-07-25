/**
 * SVG preview helpers for normalized dictionary/template strokes.
 *
 * Dictionary strokes are stored as normalized 0..1 points. These helpers project
 * them into the shared 100x100 preview viewBox used by dictionary cards, shape
 * palette items, and drag overlays.
 *
 * @packageDocumentation
 */
import type { Point } from '$lib/types.js';

/** Half-width of the box a fitted glyph fills, centered in the preview viewBox. */
const FIT_HALF_EXTENT = 41;

/**
 * Converts a single normalized stroke into an SVG `polyline` points string.
 *
 * Non-finite coordinates are skipped so partially invalid stroke data does not
 * poison the whole preview.
 *
 * @param stroke - Normalized 0..1 points from a dictionary/template stroke.
 * @returns A comma-separated SVG points string in the 100x100 preview viewBox.
 */
export function strokeToPreviewPoints(stroke: Point[]): string {
	return stroke
		.map((point) => {
			const x = Number(point.x);
			const y = Number(point.y);
			if (!Number.isFinite(x) || !Number.isFinite(y)) {
				return null;
			}
			return `${Math.round((8 + x * 84) * 10) / 10},${Math.round((8 + y * 84) * 10) / 10}`;
		})
		.filter(Boolean)
		.join(' ');
}

/**
 * Converts a list of normalized strokes into drawable SVG polylines.
 *
 * Empty strokes and strokes with no finite points are omitted.
 *
 * @param strokes - Optional list of normalized template strokes.
 * @returns Non-empty SVG polyline point strings.
 */
export function strokesToPreviewPolylines(strokes: Point[][] | undefined): string[] {
	if (!strokes?.length) {
		return [];
	}
	return strokes.map(strokeToPreviewPoints).filter((points) => points.length > 0);
}

/**
 * Projects strokes into the preview viewBox scaled and centered on their own
 * bounds, so a drawing that used a corner of its canvas still fills the frame.
 *
 * Unlike {@link strokesToPreviewPolylines}, the input need not be normalized:
 * only the strokes' shape matters, not the space they were drawn in.
 *
 * @param strokes - Stroke point lists in any consistent coordinate space.
 * @returns Non-empty SVG polyline point strings, one per drawable stroke.
 *
 * @example
 * ```ts
 * const polylines = fitStrokesToPreviewPolylines(strokes);
 * // <polyline points={polylines[0]} /> inside viewBox="0 0 100 100"
 * ```
 */
export function fitStrokesToPreviewPolylines(strokes: Point[][] | undefined): string[] {
	const drawable = (strokes ?? [])
		.map((stroke) =>
			stroke.filter((point) => Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)))
		)
		.filter((stroke) => stroke.length > 0);
	if (!drawable.length) {
		return [];
	}

	const points = drawable.flat();
	const xs = points.map((point) => Number(point.x));
	const ys = points.map((point) => Number(point.y));
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const minY = Math.min(...ys);
	const maxY = Math.max(...ys);
	const span = Math.max(maxX - minX, maxY - minY);
	// One scale for both axes keeps the seal round; a dot-sized drawing stays put.
	const scale = span > 1e-6 ? (FIT_HALF_EXTENT * 2) / span : 1;
	const centerX = (minX + maxX) / 2;
	const centerY = (minY + maxY) / 2;

	return drawable
		.map((stroke) =>
			stroke
				.map((point) => {
					const x = 50 + (Number(point.x) - centerX) * scale;
					const y = 50 + (Number(point.y) - centerY) * scale;
					return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
				})
				.join(' ')
		)
		.filter((points) => points.length > 0);
}
