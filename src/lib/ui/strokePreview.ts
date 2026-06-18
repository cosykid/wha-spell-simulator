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
