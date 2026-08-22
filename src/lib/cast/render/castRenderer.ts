/**
 * @file The cast engine: `SpellIR` in, pixels out, with the same driving
 * contract as the field renderer it replaces at phase 5. Swapping the two is
 * meant to be a one-line change at the call site.
 *
 * The clock starts at activation, not at the end of the portal tilt. R-01 makes
 * `charge` content rather than dead time, so the score's first beat spans the
 * tilt on purpose. It is silent this phase, and stops being silent when the
 * ambient medium lands in phase 4.
 *
 * There is no ownership flag and no fallback branch. A cast either has a clock,
 * in which case it paints its parcels, or it has none and paints nothing. R-11
 * puts the "nothing" case in the look table instead.
 *
 * @example
 * const renderer = new CastRenderer(effectCanvas);
 * renderer.render(spellIR, ring, timestamp, { portalFit });
 */

import { compileScore } from '../score/compileScore.js';
import { newCast, stepTo, type CastState } from '../sim/cast.js';
import { paintCast } from './painter2d.js';
import { activePortalPlane, portalScaledRing } from '../../portal/portal.js';
import type { RingInfo, SpellIR, SpellScore } from '../../types.js';

export interface CastRenderOptions {
	/**
	 * Ring, prepared and invalid feedback. The cast engine draws none of it: the
	 * redesign moves that to `renderer/glyphOverlayRenderer.ts`, which draws on the
	 * glyph canvas where the ink it annotates lives. Accepted so the call site is
	 * identical to the field renderer's.
	 */
	showGuides?: boolean;
	/** Fraction of canvas height on screen; scales the portal to match the CSS. Defaults to 1. */
	portalFit?: number;
}

/** Whether a compiled spell has a cast clock at all. */
function isCasting(spellIR: SpellIR | null | undefined): spellIR is SpellIR {
	return Boolean(
		spellIR?.active && spellIR.valid && !spellIR.prepared && typeof spellIR.activatedAt === 'number'
	);
}

/** A cast in flight: the score being performed and how far through it the sim is. */
interface RunningCast {
	score: SpellScore;
	state: CastState;
}

export class CastRenderer {
	readonly #canvas: HTMLCanvasElement;
	readonly #ctx: CanvasRenderingContext2D;
	/** The compiled spell the running cast belongs to. A change restarts everything. */
	#signature: string | null = null;
	#cast: RunningCast | null = null;

	constructor(canvas: HTMLCanvasElement) {
		this.#canvas = canvas;
		this.#ctx = canvas.getContext('2d')!;
	}

	render(
		spellIR: SpellIR | null | undefined,
		ring: RingInfo | null | undefined,
		timestamp: number,
		options: CastRenderOptions = {}
	): void {
		this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
		if (!ring?.found || !isCasting(spellIR)) {
			return;
		}

		const { score, state } = this.#castFor(spellIR);
		const tMs = timestamp - (spellIR.activatedAt ?? 0);
		// Before the strike there is nothing to advance, and past the afterglow the
		// cast is over. Both are well defined and neither is a special case.
		if (tMs < 0 || tMs > score.totalMs) {
			return;
		}

		stepTo(score, state, tMs);

		// The activated paper is shrunk and tilted by CSS, so the cast is painted on
		// the matching smaller portal rather than on the flat canvas.
		const portalFit = options.portalFit ?? 1;
		const portalRing = portalScaledRing(ring, this.#canvas, portalFit);
		const portal = activePortalPlane(this.#canvas, portalRing, portalFit);
		paintCast(this.#ctx, portal, state.parcels, { sigil: score.sigil, element: score.element });
	}

	/** Drop the running cast so the next frame starts it from the strike. */
	reset(): void {
		this.#signature = null;
		this.#cast = null;
	}

	/**
	 * The cast for this spell, compiled once per signature and stepped across
	 * frames from there. Identical signature means identical cast.
	 */
	#castFor(spellIR: SpellIR): RunningCast {
		if (this.#cast && this.#signature === spellIR.signature) {
			return this.#cast;
		}
		const score = compileScore(spellIR.plan, spellIR);
		this.#signature = spellIR.signature;
		this.#cast = { score, state: newCast(score) };
		return this.#cast;
	}
}
