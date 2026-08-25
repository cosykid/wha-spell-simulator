/**
 * @file The classic engine: `SpellIR` in, pixels out, through a Canvas2D
 * context. Restored from `src/lib/renderer/spellEffectRenderer.ts` at `b439a01`,
 * which is what the app shipped before the animation redesign.
 *
 * Its clock is the wall's, not the score's. `spellEmission` holds **all** output
 * back until the portal has finished tilting, then runs flat through the spell's
 * duration and fades. The stage starts at `activatedAt` instead and makes the
 * tilt R-01's charge beat, so the two styles do not share a frame timeline and a
 * test written for one says nothing about the other.
 *
 * Two things the legacy dispatcher did are deliberately not restored: it drew
 * the ring, prepared and invalid guides (`renderer/glyphOverlayRenderer.ts` owns
 * those now, on the glyph canvas), and it exposed its particle state as public
 * members for callers to poke (that is {@link ClassicCast.reset}).
 *
 * @example
 * const classic = new ClassicCast(effectCanvas);
 * classic.render(spellIR, ring, timestamp, { portalFit });
 */

import { PORTAL, portalScaledRing } from '../../portal/portal.js';
import { clamp } from '../../utils/geometry.js';
import { isCasting, type CastEngine, type CastRenderOptions } from '../engine.js';
import { drawEarthEffect } from './effects/earthEffect.js';
import { drawFieldEffect } from './effects/fieldEffect.js';
import { drawFireEffect } from './effects/fireEffect.js';
import { drawLightEffect } from './effects/lightEffect.js';
import { drawWaterEffect } from './effects/waterEffect.js';
import { drawWindEffect } from './effects/windEffect.js';
import { resetParticleState, type EffectState, type RenderSpellIR } from './effects/effectUtils.js';
import { buildSpellField, emptySpellField, spellFieldSignature } from './field/buildSpellField.js';
import type { SpellField } from './field/spellField.js';
import { CLASSIC, type ClassicTuning } from './tuning.js';
import type { ElementId, RingInfo, SealReading, SpellIR } from '../../types.js';

/** What every classic effect is. */
type EffectDrawFn = (
	ctx: CanvasRenderingContext2D,
	state: EffectState,
	spellIR: RenderSpellIR,
	ring: RingInfo,
	dt: number,
	classic: ClassicTuning
) => void;

const EFFECTS: Record<ElementId, EffectDrawFn> = {
	fire: drawFireEffect,
	water: drawWaterEffect,
	wind: drawWindEffect,
	earth: drawEarthEffect,
	light: drawLightEffect
};

function spellDurationMs(spellIR: SpellIR | null | undefined): number {
	const durationSeconds = Number(spellIR?.duration);
	return Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds * 1000 : 0;
}

/**
 * How much of the spell is being emitted at `timestamp`, 0..1. The canvas tilts
 * into the screen first, so every effect is held back until that portal-open
 * animation has finished; then the spell's own timeline starts.
 */
export function spellEmission(
	spellIR: SpellIR | null | undefined,
	timestamp: number,
	tiltMs: number
): number {
	const durationMs = spellDurationMs(spellIR);
	if (!spellIR?.active || durationMs <= 0 || typeof spellIR.activatedAt !== 'number') {
		return 0;
	}

	const elapsed = timestamp - spellIR.activatedAt - tiltMs;
	if (elapsed < 0) {
		return 0;
	}
	if (elapsed <= durationMs) {
		return 1;
	}

	return clamp(1 - (elapsed - durationMs) / CLASSIC.endFadeMs);
}

/** How long a classic cast paints for, from activation to an empty canvas. */
export function classicCastTotalMs(durationSeconds: number): number {
	return PORTAL.tiltMs + Math.max(0, durationSeconds) * 1000 + CLASSIC.endFadeMs;
}

export class ClassicCast implements CastEngine {
	readonly #canvas: HTMLCanvasElement;
	readonly #ctx: CanvasRenderingContext2D | null;
	#state: EffectState = { particles: [] };
	/** What the particles belong to. A change restarts everything. See {@link #castKeyFor}. */
	#castKey: string | null = null;
	/** The reading the field was built from, compared by identity to skip rebuilding it. */
	#reading: SealReading | null = null;
	#field: SpellField = emptySpellField();
	#lastTime: number | null = null;

	constructor(canvas: HTMLCanvasElement) {
		this.#canvas = canvas;
		this.#ctx = canvas.getContext('2d');
	}

	render(
		spellIR: SpellIR | null | undefined,
		ring: RingInfo | null | undefined,
		timestamp: number,
		options: CastRenderOptions = {}
	): void {
		const ctx = this.#ctx;
		if (!ctx) {
			return;
		}
		ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);

		if (!ring?.found || !isCasting(spellIR)) {
			// The next cast starts its own clock rather than inheriting the gap since
			// the last one, which would arrive as one over-long step.
			this.#lastTime = null;
			return;
		}

		// Every classic effect integrates in 60fps frame units, not milliseconds.
		const dt = Math.min(
			CLASSIC.deltaFrameMax,
			Math.max(
				CLASSIC.deltaFrameMin,
				this.#lastTime === null ? 1 : (timestamp - this.#lastTime) / CLASSIC.targetFrameMs
			)
		);
		this.#lastTime = timestamp;

		const drawEffect = this.#effectFor(spellIR);
		if (!drawEffect) {
			return;
		}

		const emission = spellEmission(spellIR, timestamp, PORTAL.tiltMs);
		if (emission <= 0 && !this.#state.particles.length) {
			return;
		}

		// The activated paper is shrunk and tilted by CSS. Emit from the matching
		// smaller portal, scaled to the viewport the same way (see portalFit).
		const portalFit = options.portalFit ?? 1;
		const portalRing = portalScaledRing(ring, this.#canvas, portalFit);
		const renderSpellIR: RenderSpellIR = { ...spellIR, emission, portalFit, field: this.#field };
		ctx.save();
		ctx.globalCompositeOperation = 'lighter';
		drawEffect(ctx, this.#state, renderSpellIR, portalRing, dt, CLASSIC);
		ctx.restore();
	}

	/** Drop the running cast so the next frame builds it from the strike. */
	reset(): void {
		resetParticleState(this.#state);
		this.#castKey = null;
		this.#reading = null;
		this.#field = emptySpellField();
		this.#lastTime = null;
	}

	/** A 2D context has nothing to give back, so this is `reset` plus a wipe. */
	dispose(): void {
		this.reset();
		this.#ctx?.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
	}

	/**
	 * Which of this engine's own renderers draws, resolved once per cast key.
	 *
	 * The choice between the field and the five element renderers is internal:
	 * both are `classic`, and no engine boundary is crossed. A seal with force
	 * sources runs the field, exactly as it did at `b439a01`; a sigil-only seal
	 * runs its element.
	 */
	#effectFor(spellIR: SpellIR): EffectDrawFn | null {
		// The reading is a fresh object per compile but usually an identical one, so
		// identity says only whether the field is worth rebuilding, never whether the
		// cast should restart. The digest says that.
		if (this.#reading !== spellIR.reading) {
			this.#reading = spellIR.reading;
			this.#field = buildSpellField(spellIR.reading);
		}
		const castKey = this.#castKeyFor(spellIR);
		if (this.#castKey !== castKey) {
			this.#castKey = castKey;
			resetParticleState(this.#state);
		}
		if (this.#field.sources.length > 0) {
			return drawFieldEffect;
		}
		return spellIR.element ? EFFECTS[spellIR.element] : null;
	}

	/**
	 * What a restart is keyed on. `SpellIR.signature` is the compiler's own reset
	 * key and covers everything the plan animates from, but it deliberately leaves
	 * the reading out, and classic's field comes from the reading rather than from
	 * the plan. So the field's digest is folded in beside it.
	 */
	#castKeyFor(spellIR: SpellIR): string {
		return `${spellIR.signature}|${spellFieldSignature(this.#field)}`;
	}
}
