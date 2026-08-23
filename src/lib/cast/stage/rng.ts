/**
 * @file The stage's only source of randomness, and the hash that seeds it.
 *
 * The same two functions `sim/rng.ts` carries, given a home under `stage/`
 * because `sim/` is deleted at cutover and a cell may not outlive its imports.
 * They are copied rather than shared for the same reason the golden tier copies
 * them: a stream that disagrees with the one a baseline was recorded from is not
 * a baseline. If you change one, change all three.
 *
 * Nothing below `stage/` may call `Math.random` or read a clock.
 *
 * @example
 * const rng = mulberry32(hashSeed(`${score.signature}:${trackIndex}`));
 */

/** A seeded stream of numbers in `[0, 1)`. */
export type Rng = () => number;

/** Deterministic 32-bit PRNG. Same seed, same sequence, on every platform. */
export function mulberry32(seed: number): Rng {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * FNV-1a over a string, as an unsigned 32-bit number. A cell seeds itself from
 * the score signature and its own track index through this, so the same spell
 * always builds the same form and two tracks never share a stream.
 */
export function hashSeed(text: string): number {
	let hash = FNV_OFFSET_BASIS;
	for (let i = 0; i < text.length; i += 1) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, FNV_PRIME);
	}
	return hash >>> 0;
}
