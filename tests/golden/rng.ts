/**
 * @file The golden rig's only source of randomness. Salvaged mulberry32 from
 * the `theorycrafting` branch, plus the preset-id seed derivation.
 *
 * Nothing in `tests/golden/` may call `Math.random` or read a clock: a baseline
 * that moves between two runs of the same code is not a baseline.
 */

/** Deterministic 32-bit PRNG. Same seed, same sequence, on every platform. */
export function mulberry32(seed: number): () => number {
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
 * Seed a preset's population from its id, so each preset gets its own stable
 * spawn pattern and renaming a preset is a visible baseline change.
 *
 * @example
 * const rng = mulberry32(presetSeed('column-balanced'));
 */
export function presetSeed(presetId: string): number {
	let hash = FNV_OFFSET_BASIS;
	for (let i = 0; i < presetId.length; i += 1) {
		hash ^= presetId.charCodeAt(i);
		hash = Math.imul(hash, FNV_PRIME);
	}
	return hash >>> 0;
}
