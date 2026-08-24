/**
 * @file How a cast is built and stepped in a test, in one place, so every suite
 * builds it the way `stage/stage.ts` does.
 *
 * A helper, not a suite: the runner glob only picks up `*.test.ts`.
 *
 * @example
 * const cast = castFor(scoreFor('column-balanced', 'fire'));
 * advanceTo(cast, 2600);
 * reportOf(cast, 'jet').tip.z;
 */

import assert from 'node:assert/strict';
import { compileScore, scoreTracks, type CastSource } from '../src/lib/cast/score/compileScore.js';
import { lookRow } from '../src/lib/cast/looks/table.js';
import { cellFor } from '../src/lib/cast/cells/registry.js';
import { Substrate } from '../src/lib/cast/hybrid/substrate.js';
import {
	STAGE,
	advanceCells,
	bindCouplings,
	newStageClock,
	type Performer,
	type StageClock
} from '../src/lib/cast/stage/frames.js';
import { hashSeed } from '../src/lib/cast/rng.js';
import { clamp } from '../src/lib/utils/geometry.js';
import { resolvePlan } from '../src/lib/compiler/plan/resolvePlan.js';
import { readPresetSeal } from '../src/lib/ui/spellEffectLab.js';
import { presetById } from '../src/lib/ui/spellEffectLabPresets.js';
import type { CellReport } from '../src/lib/cast/cells/cell.js';
import type { ScoreTrack, SpellScore } from '../src/lib/types.js';

/** A cast in flight, with nothing to draw it. */
export interface HeadlessCast {
	score: SpellScore;
	performers: Performer[];
	clock: StageClock;
	substrate: Substrate;
}

/** The drawing quality every suite performs at, so no case is quietly special. */
export const TEST_QUALITY = 0.8;

/** One lab preset's score, on a pinned signature and a four-second clock. */
export function scoreFor(presetId: string, sigil: string, source: CastSource): SpellScore {
	return compileScore(resolvePlan(readPresetSeal(presetById(presetId).signs, sigil)), source);
}

/**
 * Every cell of a score over a substrate with no GPU behind it, seeded and
 * coupled exactly as `stage/stage.ts` seeds and couples them.
 */
export function castFor(
	score: SpellScore,
	options: { quality?: number; tracks?: ScoreTrack[]; couple?: boolean } = {}
): HeadlessCast {
	const look = lookRow({ sigil: score.sigil, element: score.element });
	const tracks = options.tracks ?? scoreTracks(score);
	const substrate = new Substrate(
		tracks,
		look,
		{ sigil: score.sigil, element: score.element },
		score.signature
	);
	const performers: Performer[] = tracks.map((track, index) => ({
		track,
		cell: cellFor(track, {
			seed: hashSeed(`${score.signature}:${index}`),
			look,
			quality: clamp(options.quality ?? TEST_QUALITY),
			channel: substrate.channels[index]
		})
	}));
	if (options.couple !== false) {
		bindCouplings(performers);
	}
	return { score, performers, clock: newStageClock(), substrate };
}

/** Step every cell up to `atMs` in whole frames, carrying the declared couplings. */
export function advanceTo(cast: HeadlessCast, atMs: number): void {
	advanceCells(cast.score, cast.performers, cast.clock, atMs);
}

/** A cast stepped through each stop in order, the way a frame loop reaches one. */
export function steppedTo(
	score: SpellScore,
	stops: readonly number[],
	options: Parameters<typeof castFor>[1] = {}
): HeadlessCast {
	const cast = castFor(score, options);
	for (const stop of stops) {
		advanceTo(cast, stop);
	}
	return cast;
}

/** The performer of one kind, asserted to exist. */
export function performerOf(cast: HeadlessCast, kind: ScoreTrack['kind']): Performer {
	const performer = cast.performers.find((candidate) => candidate.track.kind === kind);
	assert.ok(performer, `expected a ${kind} track`);
	return performer;
}

/** What one kind's cell reached. */
export function reportOf(cast: HeadlessCast, kind: ScoreTrack['kind']): CellReport {
	return performerOf(cast, kind).cell.report();
}

/** Every cell's report, for the replay and reproducibility gates. */
export function reportsOf(cast: HeadlessCast): CellReport[] {
	return cast.performers.map(({ cell }) => cell.report());
}

/** Give back everything the cast built. */
export function disposeCast(cast: HeadlessCast): void {
	for (const { cell } of cast.performers) {
		cell.dispose();
	}
}

/**
 * Whether `atMs` lands on a whole frame of the stage's fixed step. Asked in exact
 * arithmetic: the step is 1000/120 ms, so a whole step is any millisecond whose
 * product with 120 is a whole thousand.
 */
export function landsOnStep(atMs: number): boolean {
	return (atMs * STAGE.stepsPerSecond) % 1000 === 0;
}

/** The last whole step inside a beat, so a sample cannot land on its boundary. */
export function insideBeat(cast: HeadlessCast, beat: keyof SpellScore['beats'], at = 0.5): number {
	const window = cast.score.beats[beat];
	const wanted = window.startMs + (window.endMs - window.startMs) * at;
	return Math.round(wanted / STAGE.stepMs) * STAGE.stepMs;
}
