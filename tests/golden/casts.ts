/**
 * @file What a cast baseline is: which presets, which timestamps, and where the
 * PNG for each pair lives. Shared by the comparing test and the updater so they
 * can never disagree about a filename.
 *
 * This is the motion tier for `cast/`, and it deliberately does not touch
 * `field/`. The score reads two fields off the compiled spell, its length and
 * its signature, and both are pinned here, so a field or renderer change cannot
 * move a cast baseline and a score or sim change always does.
 */

import { fileURLToPath } from 'node:url';
import { compileScore, type CastSource } from '../../src/lib/cast/score/compileScore.js';
import { CAST, newCast, stepTo } from '../../src/lib/cast/sim/cast.js';
import type { Parcel } from '../../src/lib/cast/sim/parcel.js';
import { resolvePlan } from '../../src/lib/compiler/plan/resolvePlan.js';
import { readPresetSeal } from '../../src/lib/ui/spellEffectLab.js';
import { FIELD_PRESETS, type FieldPreset } from '../../src/lib/ui/spellEffectLabPresets.js';
import { rasterizePopulation } from './rasterizer.js';
import { GOLDEN_SIGIL } from './plans.js';
import type { SpellScore } from '../../src/lib/types.js';

export { FIELD_PRESETS, type FieldPreset };

export const CAST_DIR = fileURLToPath(new URL('./casts/', import.meta.url));

/**
 * Four seconds, so `totalMs` is 4000 and the body beat runs 1300ms to 2820ms.
 * Pinned rather than read off a slider: a baseline whose beat clock moves when a
 * default changes is not a baseline.
 */
export const CAST_DURATION_S = 4;

/**
 * Sampled inside four different beats, each landing exactly on a simulation
 * step. The charge frame is the ambient medium alone: R-01 makes the charge
 * content rather than dead time, and `shimmer` is the only track allowed to play
 * it, so 850ms is where a baseline can see the medium drawing inward with the
 * spell's own manifestation still to come.
 */
export const CAST_FRAME_MS = [850, 1100, 1600, 2600] as const;

export interface CastFrame {
	fileName: string;
	atMs: number;
	png: Buffer;
}

export function castFileName(presetId: string, atMs: number): string {
	return `${presetId}-${String(atMs).padStart(4, '0')}ms.png`;
}

/** What the score reads off a compiled spell, pinned per preset. */
export function castSource(presetId: string): CastSource {
	return { signature: `cast-golden:${presetId}`, duration: CAST_DURATION_S };
}

/** One preset's score: the same plan the plan tier snapshots, given a timeline. */
export function presetScore(preset: FieldPreset): SpellScore {
	return compileScore(
		resolvePlan(readPresetSeal(preset.signs, GOLDEN_SIGIL)),
		castSource(preset.id)
	);
}

/** The rasterizer draws the motion tier's parcel shape; a cast parcel is one seal-space point. */
function asPopulation(parcels: Parcel[]) {
	return parcels.map((parcel) => ({
		x: parcel.at.x,
		y: parcel.at.y,
		z: parcel.at.z,
		vx: parcel.velocity.x,
		vy: parcel.velocity.y,
		vz: parcel.velocity.z,
		escaped: false
	}));
}

/**
 * Every frame of one preset, rendered by stepping a single cast through the
 * timestamps in order. Fresh and incremental stepping agree, so this is the same
 * result as simulating each timestamp from scratch.
 */
export function renderPresetCast(preset: FieldPreset): CastFrame[] {
	const score = presetScore(preset);
	const state = newCast(score);
	return CAST_FRAME_MS.map((atMs) => {
		stepTo(score, state, atMs);
		return {
			fileName: castFileName(preset.id, atMs),
			atMs,
			png: rasterizePopulation(asPopulation(state.parcels))
		};
	});
}

/**
 * Whether `atMs` lands on a whole simulation step, which every sampled timestamp
 * must. Asked in exact arithmetic: the step is 1000/120 ms, so a whole step is
 * any millisecond whose product with 120 is a whole thousand. Multiplying the
 * step count back out instead would reject perfectly good timestamps on float
 * dust.
 */
export function landsOnStep(atMs: number): boolean {
	return (atMs * CAST.stepsPerSecond) % 1000 === 0;
}
