/**
 * @file What a plan golden is: which presets, and where the text for each one
 * lives. Shared by the comparing test and the updater so they can never disagree
 * about a filename.
 *
 * This is the cheapest of the three golden tiers. It re-reads the same lab
 * presets the motion and look tiers render, but compares text a reviewer can
 * read: a changed canon ruling shows up as a changed line instead of a changed
 * pixel. One file per preset, so a review diff stays legible.
 */

import { fileURLToPath } from 'node:url';
import { planText } from '../../src/lib/compiler/plan/planText.js';
import { resolvePlan } from '../../src/lib/compiler/plan/resolvePlan.js';
import { DEFAULT_SIGIL, readPresetSeal } from '../../src/lib/ui/spellEffectLab.js';
import { LAB_PRESETS, type LabPreset } from '../../src/lib/ui/spellEffectLabPresets.js';

export { LAB_PRESETS, type LabPreset };

export const PLAN_DIR = fileURLToPath(new URL('./plans/', import.meta.url));

/**
 * The lab's default sigil, unless a material-specific preset supplies its own.
 * Both golden tiers and the live lab use the same choice.
 */
export const GOLDEN_SIGIL = DEFAULT_SIGIL;

export function planFileName(presetId: string): string {
	return `${presetId}.txt`;
}

/** One preset's plan, as the committed file's exact contents. */
export function renderPresetPlan(preset: LabPreset): string {
	return `${planText(resolvePlan(readPresetSeal(preset.signs, preset.sigil ?? GOLDEN_SIGIL)))}\n`;
}
