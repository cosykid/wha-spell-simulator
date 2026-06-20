import type { Placement } from '$lib/types.js';

/**
 * Orders placements for painting so spell rings sit beneath sigils and signs.
 *
 * A ring is the spell's boundary and symbols belong inside it, so a ring dropped
 * after some symbols should not cover them. The same order drives hit-testing
 * (reversed), so symbols inside a ring still win the click over the ring around
 * them. Ordering is otherwise stable, preserving the sequence shapes were placed.
 *
 * @example
 * placementsInRenderOrder([sign, ring, sigil]) // -> [ring, sign, sigil]
 */
export function placementsInRenderOrder(placements: Placement[]): Placement[] {
	return [...placements].sort((a, b) => renderRank(a) - renderRank(b));
}

function renderRank(placement: Placement): number {
	return placement.kind === 'ring' ? 0 : 1;
}
