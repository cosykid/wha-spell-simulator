/**
 * @file Static glyph thumbnails for saved spells. A preset deserialized at
 * canvas size 1 lands in the 0..1 space of the canvas it was drawn on, wherever
 * on that canvas the witch worked, so the thumbnail fits the seal to the frame.
 */
import { bakePlacementToStrokes } from '$lib/input/shapeBaker.js';
import { deserializeSpellPreset, type SpellPresetData } from '$lib/structures/spellPreset.js';
import { fitStrokesToPreviewPolylines } from '$lib/ui/strokePreview.js';

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
		return fitStrokesToPreviewPolylines(pointSets);
	} catch {
		return [];
	}
}
