/**
 * @file The headless half of the cast, for the golden tier: a cast built from a
 * score and stepped in whole frames, with no `WebGLRenderer`, no canvas and no
 * DOM.
 *
 * The substrate's CPU half is plain arithmetic; only its parcel field needs a GL
 * context. So the golden tier performs a cast exactly the way the stage does —
 * same registry, same seeds, same fixed step, same couplings, same pool
 * allocation — and reads the cells' own reports instead of pixels. Pixel truth
 * lives in the Playwright look tier.
 *
 * It is one re-export on purpose: [`../castHarness.ts`](../castHarness.ts) is
 * the one place a test builds a cast, so this tier and the unit suites can never
 * disagree about how the stage builds one.
 *
 * @example
 * const cast = buildCast(presetScore(preset), 1);
 * advanceCastTo(cast, 1600);
 */

import { advanceTo, castFor, disposeCast, landsOnStep, type HeadlessCast } from '../castHarness.js';
import type { SpellScore } from '../../src/lib/types.js';

export { landsOnStep, disposeCast, type HeadlessCast };

/**
 * Every cell of a score, over a substrate with no GPU behind it. `quality` is
 * the seal's drawing quality, which buys form roughness and never strength.
 */
export function buildCast(score: SpellScore, quality: number): HeadlessCast {
	return castFor(score, { quality });
}

/** Step every cell up to `atMs` in whole frames, carrying the declared couplings. */
export function advanceCastTo(cast: HeadlessCast, atMs: number): void {
	advanceTo(cast, atMs);
}
