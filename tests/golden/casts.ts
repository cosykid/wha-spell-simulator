/**
 * @file What a cast baseline is: which presets, which timestamps, and where the
 * text for each preset lives. Shared by the comparing test and the updater so
 * they can never disagree about a filename.
 *
 * This is the motion tier. The score reads two values off the compiled spell,
 * its length and its signature, and both are pinned here, so a compiler change
 * cannot move a cast baseline and a score or cell change always does.
 *
 * One file per preset, holding every sampled frame in order, because a cast is
 * read as a performance: what the beam did between the strike and the body is
 * the thing under review, and four files would hide it.
 */

import { fileURLToPath } from 'node:url';
import { compileScore, type CastSource } from '../../src/lib/cast/score/compileScore.js';
import { resolvePlan } from '../../src/lib/compiler/plan/resolvePlan.js';
import { readPresetSeal } from '../../src/lib/ui/spellEffectLab.js';
import { LAB_PRESETS, type LabPreset } from '../../src/lib/ui/spellEffectLabPresets.js';
import { advanceCastTo, buildCast, disposeCast, type HeadlessCast } from './cellHarness.js';
import { frameText } from './cellState.js';
import { GOLDEN_SIGIL } from './plans.js';
import type { SpellPlan, SpellScore } from '../../src/lib/types.js';

export { LAB_PRESETS, type LabPreset };
export { landsOnStep } from './cellHarness.js';

export const CAST_DIR = fileURLToPath(new URL('./casts/', import.meta.url));

/**
 * Four seconds, so `totalMs` is 4000 and the body beat runs 1300ms to 2820ms.
 * Pinned rather than read off a slider: a baseline whose beat clock moves when a
 * default changes is not a baseline.
 */
export const CAST_DURATION_S = 4;

/**
 * Sampled inside four different beats, each landing exactly on a whole frame of
 * the stage's fixed step. The charge frame is the ambient medium alone: R-01
 * makes the charge content rather than dead time, and the medium is the only
 * cell allowed to play it, so 850ms is where a baseline can see it drawing
 * inward with the spell's own manifestation still to come.
 */
export const CAST_FRAME_MS = [850, 1100, 1600, 2600] as const;

export function castFileName(presetId: string): string {
	return `${presetId}.txt`;
}

/** What the score reads off a compiled spell, pinned per preset. */
export function castSource(presetId: string): CastSource {
	return { signature: `cast-golden:${presetId}`, duration: CAST_DURATION_S };
}

/** One preset's plan: the same one the plan tier snapshots. */
export function presetPlan(preset: LabPreset): SpellPlan {
	return resolvePlan(readPresetSeal(preset.signs, GOLDEN_SIGIL));
}

/** One preset's score: that plan, given a timeline. */
export function presetScore(preset: LabPreset): SpellScore {
	return compileScore(presetPlan(preset), castSource(preset.id));
}

/** One preset's cells, built and waiting at the top of the cast. */
export function newPresetCast(preset: LabPreset): HeadlessCast {
	const plan = presetPlan(preset);
	return buildCast(compileScore(plan, castSource(preset.id)), plan.quality);
}

/**
 * Every sampled frame of one preset, performed by stepping a single cast through
 * the timestamps in order. Fresh and incremental stepping agree, so this is the
 * same result as building a cast per timestamp.
 */
export function renderPresetCast(preset: LabPreset): string {
	const cast = newPresetCast(preset);
	const frames = CAST_FRAME_MS.map((atMs) => {
		advanceCastTo(cast, atMs);
		return frameText(cast, atMs);
	});
	disposeCast(cast);
	return `cast ${preset.id}\n\n${frames.join('\n\n')}\n`;
}
