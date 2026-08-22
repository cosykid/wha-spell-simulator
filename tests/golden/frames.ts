/**
 * @file What a motion baseline is: which presets, which timestamps, and where
 * the PNG for each pair lives. Shared by the comparing test and the updater so
 * they can never disagree about a filename.
 */

import { fileURLToPath } from 'node:url';
import { FIELD_PRESETS, type FieldPreset } from '../../src/lib/ui/spellEffectLabPresets.js';
import { rasterizePopulation } from './rasterizer.js';
import { spawnPopulation, stepTo } from './motion.js';

export { FIELD_PRESETS, type FieldPreset };

/**
 * Sampled at spawn, mid-flow, and developed. Each must land on a whole
 * simulation step (a multiple of `MOTION.stepMs`) so the timestamp a baseline
 * claims is the timestamp it was rendered at.
 *
 * The window ends at 600ms because the fastest presets (dispersion, the
 * inverted pull) have crossed the panel by then, and a frame everything has
 * left compares equal for the wrong reason.
 */
export const FRAME_MS = [0, 300, 600] as const;

export const BASELINE_DIR = fileURLToPath(new URL('./baselines/', import.meta.url));

export interface Frame {
	fileName: string;
	atMs: number;
	png: Buffer;
}

export function baselineFileName(presetId: string, atMs: number): string {
	return `${presetId}-${String(atMs).padStart(4, '0')}ms.png`;
}

/**
 * Every frame of one preset, rendered by stepping a single population through
 * the timestamps in order. Fresh and incremental stepping agree, so this is the
 * same result as simulating each timestamp from scratch.
 */
export function renderPresetFrames(preset: FieldPreset): Frame[] {
	const population = spawnPopulation(preset.id, preset.signs);
	return FRAME_MS.map((atMs) => {
		stepTo(population, atMs);
		return {
			fileName: baselineFileName(preset.id, atMs),
			atMs,
			png: rasterizePopulation(population.parcels)
		};
	});
}
