/**
 * @file The one spell this prototype performs, and the only glue that reaches
 * back into the real pipeline.
 *
 * Copied from `spell-effect-lab/lab-preview.ts`: the `column-balanced` preset is
 * gated into a `SealReading`, resolved into a plan, compiled into a `SpellScore`,
 * and the jet track that comes out is what the brush column actually flows
 * along. Nothing here is generic — a bake-off prototype owes one spell.
 */

import { CONFIG } from '$lib/config.js';
import { compileScore, scoreTracks } from '$lib/cast/score/compileScore.js';
import { buildSpellIR, defaultControlValues, readPresetSeal } from '$lib/ui/spellEffectLab.js';
import { presetById } from '$lib/ui/spellEffectLabPresets.js';
import type { Beat, BeatWindow, JetParams, Site } from '$lib/types.js';

/** The preset and sigil the bake-off judges this direction on. */
const PRESET_ID = 'column-balanced';
const SIGIL = 'fire';

/** Slider value the ring is drawn at, so the paper stand-in matches the camera. */
export const RING_RADIUS_NORM = defaultControlValues().ringRadius;

/** What the brush column reads off the compiled score. */
export interface BrushSpell {
	totalMs: number;
	beats: Record<Beat, BeatWindow>;
	/** Seal units per second up the column axis. */
	speed: number;
	/** Seal units from the axis where the beam is still at half strength. */
	footprint: number;
	/** How hard the column drafts pigment back onto its own axis. */
	converge: number;
	/** Seal units along the axis where the beam has spent half its push. */
	reach: number;
	/** The three drawn columns, as ring positions with an inward facing. */
	sites: Site[];
	/** The plan's n-fold snap. Three, for this preset. */
	symmetry: number;
}

/**
 * Compiles the prototype's spell once. Falls back to the score's own defaults if
 * the plan ever stops resolving a jet, so the page cannot go blank on a compile
 * change elsewhere in the repo.
 */
export function brushSpell(): BrushSpell {
	const preset = presetById(PRESET_ID);
	const reading = readPresetSeal(preset.signs, SIGIL);
	const spellIR = buildSpellIR({
		values: defaultControlValues(),
		element: 'fire',
		sigil: SIGIL,
		activatedAt: 0,
		config: CONFIG,
		reading
	});
	const score = compileScore(spellIR.plan, spellIR);
	const jet = scoreTracks(score).find((track) => track.kind === 'jet')?.params as
		| JetParams
		| undefined;

	return {
		totalMs: score.totalMs,
		beats: score.beats,
		speed: jet?.speed ?? 1.9,
		footprint: jet?.footprint ?? 0.45,
		converge: jet?.converge ?? 0.59,
		reach: jet?.reach ?? 1.6,
		sites: jet?.sites ?? [],
		symmetry: jet?.symmetry ?? 3
	};
}
