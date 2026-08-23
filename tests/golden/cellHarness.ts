/**
 * @file The headless half of the cell stage: a cast built from a score and
 * stepped in whole frames, with no `WebGLRenderer`, no canvas and no DOM.
 *
 * Three.js geometry, materials and transforms are plain arithmetic; only the
 * renderer needs a GL context. So the golden tier performs a cast exactly the
 * way the stage does — same registry, same seeds, same fixed step, same
 * couplings — and reads the cells' own state instead of pixels. Pixel truth
 * lives in the Playwright look tier.
 *
 * {@link buildCast} mirrors `stage/stage.ts`'s `#castFor`. If that changes how a
 * cast is built (seeds, look resolution, coupling binding), this has to change
 * with it, or the tier stops describing what ships.
 *
 * @example
 * const cast = buildCast(presetScore(preset), 1);
 * advanceCastTo(cast, 1600);
 */

import { cellFor } from '../../src/lib/cast/cells/registry.js';
import { scoreTracks } from '../../src/lib/cast/score/compileScore.js';
import { lookRow } from '../../src/lib/cast/looks/table.js';
import {
	STAGE,
	advanceCells,
	bindCouplings,
	newStageClock,
	type Performer,
	type StageClock
} from '../../src/lib/cast/stage/frames.js';
import { hashSeed } from '../../src/lib/cast/rng.js';
import { clamp } from '../../src/lib/utils/geometry.js';
import type { SpellScore } from '../../src/lib/types.js';

/** A cast in flight, with nothing to draw it: the score, its cells, and the clock. */
export interface HeadlessCast {
	score: SpellScore;
	performers: Performer[];
	clock: StageClock;
}

/**
 * Every cell of a score, built and parented to nothing. `quality` is the seal's
 * drawing quality, which buys form roughness and never strength.
 */
export function buildCast(score: SpellScore, quality: number): HeadlessCast {
	const look = lookRow({ sigil: score.sigil, element: score.element });
	const performers: Performer[] = scoreTracks(score).map((track, index) => ({
		track,
		// One stream per track, seeded exactly as the stage seeds it.
		cell: cellFor(track, {
			seed: hashSeed(`${score.signature}:${index}`),
			look,
			quality: clamp(quality)
		})
	}));
	bindCouplings(performers);
	return { score, performers, clock: newStageClock() };
}

/** Step every cell up to `atMs` in whole frames, carrying the declared couplings. */
export function advanceCastTo(cast: HeadlessCast, atMs: number): void {
	advanceCells(cast.score, cast.performers, cast.clock, atMs);
}

/** Give back every geometry, material and texture the cast built. */
export function disposeCast(cast: HeadlessCast): void {
	for (const { cell } of cast.performers) {
		cell.dispose();
	}
}

/**
 * Whether `atMs` lands on a whole frame of the stage's fixed step, which every
 * sampled timestamp must. Asked in exact arithmetic: the step is 1000/120 ms, so
 * a whole step is any millisecond whose product with 120 is a whole thousand.
 * Multiplying the step count back out would reject good timestamps on float dust.
 */
export function landsOnStep(atMs: number): boolean {
	return (atMs * STAGE.stepsPerSecond) % 1000 === 0;
}
