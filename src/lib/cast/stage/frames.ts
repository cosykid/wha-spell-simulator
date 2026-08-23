/**
 * @file The frame step: how a score's envelopes become the {@link CellFrame}s a
 * cell is advanced by.
 *
 * Two rules carried over from `sim/cast.ts`, and for the same reason. Time
 * advances in **whole steps counted as integers**, so `tMs` is a product and
 * never a running sum. And every cell gets the same fixed `dtMs`, so a cell that
 * integrates anything integrates it the same way at every frame rate. Together
 * they give the stage the contract the golden tier stands on:
 *
 * **Stepping fresh to `targetMs` is identical to stepping there incrementally.**
 *
 * @example
 * advanceCells(score, performers, clock, tMs);
 */

import { beatAt, progressThrough } from '../score/beats.js';
import { evaluateEnvelope } from '../score/envelopes.js';
import type { Cell, CellFrame } from '../cells/cell.js';
import type { ScoreTrack, SpellScore } from '../../types.js';

export const STAGE = {
	/** The redesign's fixed step (section 4). 120Hz, independent of frame rate. */
	stepsPerSecond: 120,
	stepMs: 1000 / 120
} as const;

/** One track and the cell performing it, paired once when the cast is built. */
export interface Performer {
	track: ScoreTrack;
	cell: Cell;
}

/** How far through the cast the stage has stepped. */
export interface StageClock {
	/** Always `steps * STAGE.stepMs`: a product, never a running sum. */
	tMs: number;
	steps: number;
}

/** Whole steps that reach `atMs`. Sampled timestamps must land on a step boundary. */
export function stepsFor(atMs: number): number {
	return Math.round(atMs / STAGE.stepMs);
}

/** A cast at rest, with the clock at zero. */
export function newStageClock(): StageClock {
	return { tMs: 0, steps: 0 };
}

/**
 * One track's frame at one millisecond on the cast clock. This is the whole of
 * what a cell may know: its own two envelopes, where it sits among the beats,
 * and how long the step is.
 */
export function cellFrameFor(score: SpellScore, track: ScoreTrack, tMs: number): CellFrame {
	const beat = beatAt(score.beats, tMs);
	return {
		tMs,
		beat,
		beatT: progressThrough(score.beats[beat], tMs),
		emission: evaluateEnvelope(track.emission, score.beats, tMs),
		drive: evaluateEnvelope(track.drive, score.beats, tMs),
		dtMs: STAGE.stepMs
	};
}

/**
 * Advance every cell to `targetMs` in whole steps. Stepping there in one call or
 * in several is the same state, which is what makes a screenshot independent of
 * the frames sampled before it.
 */
export function advanceCells(
	score: SpellScore,
	performers: readonly Performer[],
	clock: StageClock,
	targetMs: number
): void {
	const target = stepsFor(targetMs);
	while (clock.steps < target) {
		clock.steps += 1;
		clock.tMs = clock.steps * STAGE.stepMs;
		for (const { track, cell } of performers) {
			cell.update(cellFrameFor(score, track, clock.tMs));
		}
	}
}
