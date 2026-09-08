/**
 * @file A saved spell's thumbnail: the seal reduced to the handful of polylines
 * a library plate actually draws, in the shared 100x100 preview viewBox.
 *
 * Built once when the spell is stored, not per request. A preset holds the
 * drawing at pointer resolution (the shared library averaged 48KB a spell, of
 * which the plate rendered nothing), so the feed carries thumbnails and leaves
 * the drawing behind until a reader opens or previews one.
 */
import { bakePlacementToStrokes } from '../input/shapeBaker.js';
import { deserializeSpellPreset, type SpellPresetData } from './spellPreset.js';
import { fitStrokesToPreviewPolylines } from '../ui/strokePreview.js';
import { simplifyPath } from '../utils/simplifyPath.js';

/** SVG `polyline` point strings in the 100x100 preview viewBox, one per stroke. */
export type SpellThumbnail = string[];

/**
 * How far a thinned stroke may drift from the drawn one, in preview-box units.
 * A plate is 150 to 215px wide, so a quarter unit is under half a pixel: the
 * cut is invisible, and it removes about four fifths of the points.
 */
const SIMPLIFY_TOLERANCE = 0.25;

/**
 * Builds the thumbnail for a stored preset. A preset deserialized at canvas size
 * 1 lands in the 0..1 space of the canvas it was drawn on, wherever on that
 * canvas the witch worked, so the fit centers the seal in the frame.
 *
 * Returns an empty thumbnail for a preset that cannot be read, which draws as
 * bare paper rather than failing the row it belongs to.
 */
export function buildSpellThumbnail(data: SpellPresetData): SpellThumbnail {
	try {
		const { strokes, placements } = deserializeSpellPreset(data, 1);
		const pointSets = [
			...strokes.map((stroke) => stroke.points),
			...placements.flatMap((placement) =>
				bakePlacementToStrokes(placement).map((stroke) => stroke.points)
			)
		];
		// Simplified after the fit, so the tolerance is in the units it is
		// specified in and a small seal is not thinned harder than a large one.
		return fitStrokesToPreviewPolylines(pointSets, (points) =>
			simplifyPath(points, SIMPLIFY_TOLERANCE)
		);
	} catch {
		return [];
	}
}

/** Reads a thumbnail off a stored row, tolerating rows written before the column. */
export function toSpellThumbnail(value: unknown): SpellThumbnail {
	return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
}
