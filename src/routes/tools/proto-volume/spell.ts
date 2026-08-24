/**
 * @file The one spell all nine cells of the bake-off burn: `column-balanced`
 * compiled down to beat windows and jet numbers, copied from proto-hybrid's
 * glue rather than shared with it, because both routes are throwaway.
 *
 * The element picks the sigil so the compile is honest, but the jet numbers
 * come from the preset's signs, so all three elements cast the same budget —
 * which is the point: same spell, different physics.
 */

import { CONFIG } from '$lib/config.js';
import { compileScore, scoreTracks } from '$lib/cast/score/compileScore.js';
import { buildSpellIR, defaultControlValues, readPresetSeal } from '$lib/ui/spellEffectLab.js';
import { presetById } from '$lib/ui/spellEffectLabPresets.js';
import type { Beat, BeatWindow, JetParams } from '$lib/types.js';
import type { ProtoElement } from './elements.js';

const PRESET_ID = 'column-balanced';

const SIGIL_FOR: Record<ProtoElement, string> = {
	fire: 'fire',
	water: 'water',
	wind: 'wind-directs-air'
};

/** What every style needs to know about the spell it is burning. */
export interface ProtoSpell {
	totalMs: number;
	beats: Record<Beat, BeatWindow>;
	/** Seal units from the axis where the jet is still at half strength. */
	footprint: number;
	/** Seal units along the axis the jet spends itself over. */
	reach: number;
	/** Seal units per second at the nozzle. */
	speed: number;
}

/** Numbers used if the compile refuses a sigil. Matches proto-hybrid's bare jet. */
const BARE = { footprint: 0.45, reach: 1.6, speed: 1.9 };

/** The canon beat clock, hand-laid, used only when the compiler cannot be. */
function fallbackSpell(): ProtoSpell {
	const win = (startMs: number, endMs: number): BeatWindow => ({ startMs, endMs });
	return {
		totalMs: 5250,
		beats: {
			charge: win(0, 980),
			strike: win(980, 1300),
			body: win(1300, 3800),
			release: win(3800, 4550),
			afterglow: win(4550, 5250)
		},
		...BARE
	};
}

/** Compiles once per element. Everything downstream reads the value only. */
export function protoSpell(element: ProtoElement): ProtoSpell {
	try {
		const preset = presetById(PRESET_ID);
		const reading = readPresetSeal(preset.signs, SIGIL_FOR[element]);
		const spellIR = buildSpellIR({
			values: defaultControlValues(),
			element,
			sigil: SIGIL_FOR[element],
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
			footprint: jet?.footprint ?? BARE.footprint,
			reach: jet?.reach ?? BARE.reach,
			speed: jet?.speed ?? BARE.speed
		};
	} catch {
		return fallbackSpell();
	}
}
