/**
 * @file Static glyph thumbnails for saved spells. A preset deserialized at
 * canvas size 1 is already in the normalized 0..1 space the shared stroke
 * preview helpers expect, so placements just need baking into strokes first.
 */
import { bakePlacementToStrokes } from '$lib/input/shapeBaker.js';
import { deserializeSpellPreset, type SpellPresetData } from '$lib/structures/spellPreset.js';
import { strokesToPreviewPolylines } from '$lib/ui/strokePreview.js';

/** SVG polyline point strings for a preset, in the shared 100x100 preview viewBox. */
export function presetPreviewPolylines(data: SpellPresetData): string[] {
	try {
		const { strokes, placements } = deserializeSpellPreset(data, 1);
		const pointSets = [
			...strokes.map((stroke) => stroke.points),
			...placements.flatMap((placement) =>
				bakePlacementToStrokes(placement).map((stroke) => stroke.points)
			)
		];
		return strokesToPreviewPolylines(pointSets);
	} catch {
		return [];
	}
}
