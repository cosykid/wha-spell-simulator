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
import { FIELD_PRESETS, type FieldPreset } from '../../src/lib/ui/spellEffectLabPresets.js';

export { FIELD_PRESETS, type FieldPreset };

export const PLAN_DIR = fileURLToPath(new URL('./plans/', import.meta.url));

/**
 * The lab's own default sigil. Mode is the only plan field a sigil changes
 * (R-10), and pinning it here means a golden reads as exactly what the lab's
 * plan inspector shows when the page loads.
 */
export const GOLDEN_SIGIL = DEFAULT_SIGIL;

export function planFileName(presetId: string): string {
	return `${presetId}.txt`;
}

/** One preset's plan, as the committed file's exact contents. */
export function renderPresetPlan(preset: FieldPreset): string {
	return `${planText(resolvePlan(readPresetSeal(preset.signs, GOLDEN_SIGIL)))}\n`;
}
