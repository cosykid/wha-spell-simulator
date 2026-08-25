/**
 * @file Bake-off glue: the one spell this prototype burns. Copied from the Spell
 * Effect Lab's path (preset signs -> `SealReading` -> `SpellIR` -> `SpellScore`)
 * rather than refactored out of it, because this route is a throwaway.
 *
 * The prototype only needs the shape of the flame, so the score is read down to
 * a small {@link HybridSpell}: where the column stands, how wide and how far it
 * reaches, and the five beat boundaries `arc.ts` is hand-timed against.
 */

import { CONFIG } from '$lib/config.js';
import { compileScore, scoreTracks } from '$lib/cast/score/compileScore.js';
import { buildSpellIR, defaultControlValues, readPresetSeal } from '$lib/ui/spellEffectLab.js';
import { presetById } from '$lib/ui/spellEffectLabPresets.js';
import type { Beat, BeatWindow, JetParams, Vector } from '$lib/types.js';

/** The one arrangement the prototype performs. */
const PRESET_ID = 'column-balanced';
/** The one sigil the prototype paints. */
const SIGIL = 'fire';

/** Slider value the ring is drawn at, so the paper stand-in matches the camera. */
export const RING_RADIUS_NORM = defaultControlValues().ringRadius;

/** A column site read off the plan: where a drawn column stands, and where it leans. */
export interface FeederSite {
	at: Vector;
	facing: Vector;
}

/** What both populations need to know about the spell they are burning. */
export interface HybridSpell {
	totalMs: number;
	beats: Record<Beat, BeatWindow>;
	/** Seal units from the axis where the beam is still at half strength. */
	footprint: number;
	/** Seal units along the axis the beam spends itself over. */
	reach: number;
	/** Seal units per second at the nozzle. */
	speed: number;
	/** How hard the beam drafts what surrounds it onto its own axis, 0..1. */
	converge: number;
	/** The drawn columns, as base tongues that feed the main mass. */
	sites: FeederSite[];
}

/** Fallback numbers, used only if the plan resolves without a jet. */
const BARE_JET = { footprint: 0.45, reach: 1.6, speed: 1.9, converge: 0.6 };

/**
 * Compiles the prototype's spell once. Everything downstream reads the returned
 * value and never the compiler again.
 */
export function hybridSpell(): HybridSpell {
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
		footprint: jet?.footprint ?? BARE_JET.footprint,
		reach: jet?.reach ?? BARE_JET.reach,
		speed: jet?.speed ?? BARE_JET.speed,
		converge: jet?.converge ?? BARE_JET.converge,
		sites: (jet?.sites ?? []).map((site) => ({ at: site.at, facing: site.facing }))
	};
}
