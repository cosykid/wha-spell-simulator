/**
 * @file The legacy field renderer. Since the phase 5 cutover the simulator casts
 * through `cast/render/castRenderer.ts` and this engine survives only for the
 * Spell Effect Lab's `field` option and the library's preview book. It draws
 * active spells and nothing else: the seal guides moved to
 * `glyphOverlayRenderer.ts`, where the ink they annotate lives.
 *
 * Scheduled for deletion with `renderer/effects/` and `SpellIR.field`. See
 * `docs/animation-redesign.md`.
 */

import { drawFireEffect } from './effects/fireEffect.js';
import { drawWaterEffect } from './effects/waterEffect.js';
import { drawWindEffect } from './effects/windEffect.js';
import { drawEarthEffect } from './effects/earthEffect.js';
import { drawLightEffect } from './effects/lightEffect.js';
import { drawFieldEffect } from './effects/fieldEffect.js';
import { portalScaledRing } from '../portal/portal.js';
import { resetParticleState } from './effects/effectUtils.js';
import type { EffectState, RenderSpellIR } from './effects/effectUtils.js';
import { clamp } from '../utils/geometry.js';
import type { AppConfig, SpellIR, RingInfo, ElementId } from '../types.js';

const SPELL_END_FADE_MS = 420;
const TARGET_FRAME_MS = 16.67;
const DELTA_FRAME_MIN = 0.4;
const DELTA_FRAME_MAX = 2.5;

type EffectDrawFn = (
	ctx: CanvasRenderingContext2D,
	state: EffectState,
	spellIR: RenderSpellIR,
	ring: RingInfo,
	dt: number,
	config: AppConfig
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

// Exported for unit testing the portal-tilt hold (see spellEffectTiming.test.ts).
export function spellEmission(
	spellIR: SpellIR | null | undefined,
	timestamp: number,
	tiltMs: number
): number {
	const durationMs = spellDurationMs(spellIR);
	if (!spellIR?.active || durationMs <= 0 || typeof spellIR.activatedAt !== 'number') {
		return 0;
	}

	// The canvas tilts into the screen first; hold all emission back until that
	// portal-open animation has finished, then start the spell's own timeline.
	const elapsed = timestamp - spellIR.activatedAt - tiltMs;
	if (elapsed < 0) {
		return 0;
	}
	if (elapsed <= durationMs) {
		return 1;
	}

	return clamp(1 - (elapsed - durationMs) / SPELL_END_FADE_MS);
}

interface RenderOptions {
	/** Fraction of canvas height on screen; scales the portal tilt to match the CSS. Defaults to 1. */
	portalFit?: number;
}

export class SpellEffectRenderer {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private config: AppConfig;
	// Exposed so tool pages (e.g. Spell Effect Lab) can reset render state.
	state: EffectState;
	lastSignature: string | null;
	lastTime: number | null;

	constructor(canvas: HTMLCanvasElement, config: AppConfig) {
		this.canvas = canvas;
		this.ctx = canvas.getContext('2d')!;
		this.config = config;
		this.state = { particles: [] };
		this.lastSignature = null;
		this.lastTime = null;
	}

	render(
		spellIR: SpellIR | null | undefined,
		ring: RingInfo | null | undefined,
		timestamp: number,
		options: RenderOptions = {}
	): void {
		const width = this.canvas.width;
		const height = this.canvas.height;
		const ctx = this.ctx;
		ctx.clearRect(0, 0, width, height);

		if (!ring?.found || !spellIR) {
			return;
		}

		const dt = Math.min(
			DELTA_FRAME_MAX,
			Math.max(
				DELTA_FRAME_MIN,
				this.lastTime === null ? 1 : (timestamp - this.lastTime) / TARGET_FRAME_MS
			)
		);
		this.lastTime = timestamp;

		if (this.lastSignature !== spellIR.signature) {
			this.lastSignature = spellIR.signature;
			resetParticleState(this.state);
		}

		if (!spellIR.valid || spellIR.prepared) {
			return;
		}

		// Signs compile into field sources; when any exist the field simulation
		// drives the effect. Sigil-only spells keep the per-element renderers.
		const fieldActive = (spellIR.field?.sources.length ?? 0) > 0;
		const drawEffect = fieldActive
			? drawFieldEffect
			: spellIR.element
				? EFFECTS[spellIR.element]
				: null;
		if (!drawEffect) {
			return;
		}

		const emission = spellEmission(spellIR, timestamp, this.config.renderer.portalTiltMs);
		if (emission <= 0 && !this.state.particles.length) {
			return;
		}

		// The activated paper is shrunk and tilted by CSS. Emit from the matching
		// smaller portal, scaled to the viewport the same way (see portalFit).
		const portalFit = options.portalFit ?? 1;
		const portalRing = portalScaledRing(ring, this.canvas, portalFit);
		const renderSpellIR: RenderSpellIR = { ...spellIR, emission, portalFit };
		ctx.save();
		ctx.globalCompositeOperation = 'lighter';
		drawEffect(ctx, this.state, renderSpellIR, portalRing, dt, this.config);
		ctx.restore();
	}
}
