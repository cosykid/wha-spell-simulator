/**
 * @file The cast's only source of randomness, and the hash that seeds it.
 *
 * Salvaged from the `theorycrafting` branch. It sits at the root of `cast/`
 * beside `vec3.ts` because both halves need it: the score hashes a signature
 * into a seed, and every cell draws its form from a stream started with one.
 * There is one copy, so a stream can never disagree with the one a baseline was
 * recorded from.
 *
 * Nothing in `cast/` may call `Math.random` or read a clock.
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
 * FNV-1a over a string, as an unsigned 32-bit number. The score seeds itself
 * from `SpellIR.signature` through this, and a cell from that signature and its
 * own track index, so the same spell always builds the same forms and two tracks
 * never share a stream.
 */
export function hashSeed(text: string): number {
	let hash = FNV_OFFSET_BASIS;
	for (let i = 0; i < text.length; i += 1) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, FNV_PRIME);
	}
	return hash >>> 0;
}

/** The same hash as eight hex digits, for signatures a human has to compare. */
export function hashHex(text: string): string {
	return hashSeed(text).toString(16).padStart(8, '0');
}
