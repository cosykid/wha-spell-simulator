/**
 * @file The seam every effect engine is held through. A host owns a canvas and a
 * `CastEngine`; which class is behind it is decided once, from the user's
 * `EffectStyle`, by {@link createCastEngine} in `selectEngine.ts`.
 *
 * The argument list is the one `render/castRenderer.ts` and the Canvas2D engine
 * before it both took, which is why a second engine needs no new contract.
 *
 * @example
 * const engine: CastEngine = createCastEngine(canvas, style);
 * engine.render(spellIR, ring, timestamp, { portalFit });
 */

import type { RingInfo, SpellIR } from '../types.js';

/** The option bag a host passes on every frame. */
export interface CastRenderOptions {
	/** Fraction of canvas height on screen; scales the portal to match the CSS. Defaults to 1. */
	portalFit?: number;
}

/**
 * What a host holds. Both engines satisfy it and hosts hold the interface, never
 * the class: a host that needs to know which engine it has is a host doing
 * something wrong.
 */
export interface CastEngine {
	render(
		spellIR: SpellIR | null | undefined,
		ring: RingInfo | null | undefined,
		timestamp: number,
		options?: CastRenderOptions
	): void;
	/** Drop the cast in flight so the next frame builds it from the strike. */
	reset(): void;
	/** Give back whatever the engine holds. It is unusable after this. */
	dispose(): void;
}

/**
 * Whether a compiled spell has a cast clock at all. Both engines gate on this
 * one predicate, so "the spell is firing" means the same thing in either style.
 */
export function isCasting(spellIR: SpellIR | null | undefined): spellIR is SpellIR {
	return Boolean(
		spellIR?.active && spellIR.valid && !spellIR.prepared && typeof spellIR.activatedAt === 'number'
	);
}
