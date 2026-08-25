/**
 * @file Canvas harness that replays a saved spell's effect for the library
 * book. Follows the Spell Effect Lab's preview pattern: the stored drawing is
 * inked onto a glyph canvas while the real cast engine plays the stored IR over
 * it, against a synthetic sealed ring. No recognition runs.
 *
 * Which engine that is comes from the caster's own `EffectStyle`, read once by
 * `SpellPreview.svelte`: a spell is not stored with a style, and one setting per
 * user beats two. The effect canvas belongs to whichever engine took it, so
 * nothing else may call `getContext` on it. A card's preview mounts and unmounts
 * with the toggle, and a book holds many of them, so the teardown gives back
 * whatever the engine held.
 */
import { createCastEngine } from '$lib/cast/selectEngine.js';
import type { CastEngine } from '$lib/cast/engine.js';
import { classicCastTotalMs } from '$lib/cast/classic/classicCast.js';
import { totalMsFor } from '$lib/cast/score/beats.js';
import { DEFAULT_EFFECT_STYLE, type EffectStyle } from '$lib/structures/effectStyle.js';
import { drawSealIgnition } from '$lib/renderer/sealIgnition.js';
import { CONFIG } from '$lib/config.js';
import { bakePlacementToStrokes } from '$lib/input/shapeBaker.js';
import { inertPlan } from '$lib/compiler/plan/resolvePlan.js';
import { emptySealReading } from '$lib/compiler/reading/readSeal.js';
import { deserializeSpellPreset, type SpellPresetData } from '$lib/structures/spellPreset.js';
import type { RingInfo, SpellIR, Stroke } from '$lib/types.js';
import { renderPaper } from '$canvas/entities/paperEntity.js';

/** Padding after the cast's last beat before a replay counts as finished. */
const END_GRACE_MS = 1600;

/**
 * The stored IR, as an active cast. Rows saved before the Reading and Plan layers
 * landed hold the scalars and the deleted force field but neither of those, and
 * the two engines perform one each, so an old row gets the inert plan and the
 * empty reading: R-11 says a seal that manifests nothing is a look, never a blank
 * canvas. `reviveSpell.ts` re-reads a legacy row's drawing before this driver is
 * built, so these fallbacks are the last resort — a failed revival, or a caller
 * that skipped it. Everything else about the replay is unchanged.
 */
function playableIr(stored: SpellIR): SpellIR {
	return {
		...stored,
		active: true,
		prepared: false,
		reading: stored.reading ?? emptySealReading(),
		plan: stored.plan ?? inertPlan()
	};
}

function estimateRing(strokes: Stroke[], canvasSize: number): RingInfo {
	const points = strokes.flatMap((stroke) => stroke.points);
	let center = { x: canvasSize / 2, y: canvasSize / 2 };
	let radius = canvasSize * 0.36;
	if (points.length > 8) {
		const mean = points.reduce(
			(acc, point) => ({ x: acc.x + point.x / points.length, y: acc.y + point.y / points.length }),
			{ x: 0, y: 0 }
		);
		const distances = points
			.map((point) => Math.hypot(point.x - mean.x, point.y - mean.y))
			.sort((a, b) => a - b);
		const outer = distances[Math.floor(distances.length * 0.9)];
		if (outer > canvasSize * 0.1) {
			center = mean;
			radius = outer;
		}
	}
	return { found: true, complete: true, center, radius };
}

/**
 * Drives one spell preview across two stacked canvases. Create it after mount,
 * call {@link start}, and dispose with the returned teardown.
 */
export class SpellPreviewDriver {
	readonly #glyphCanvas: HTMLCanvasElement;
	readonly #effectCanvas: HTMLCanvasElement;
	readonly #shell: HTMLElement;
	readonly #ir: SpellIR;
	readonly #onEnded: (() => void) | null;
	readonly #effectStyle: EffectStyle;
	readonly #effectEngine: CastEngine;
	readonly #glyphCtx: CanvasRenderingContext2D;
	#strokes: Stroke[] = [];
	#ring: RingInfo = { found: true, complete: true, center: { x: 0, y: 0 }, radius: 1 };
	#data: SpellPresetData;
	#activatedAt = 0;
	#endedFired = false;
	#rafId: number | null = null;

	constructor(options: {
		glyphCanvas: HTMLCanvasElement;
		effectCanvas: HTMLCanvasElement;
		shell: HTMLElement;
		data: SpellPresetData;
		previewIr: SpellIR;
		effectStyle?: EffectStyle;
		onEnded?: () => void;
	}) {
		this.#glyphCanvas = options.glyphCanvas;
		this.#effectCanvas = options.effectCanvas;
		this.#shell = options.shell;
		this.#data = options.data;
		this.#onEnded = options.onEnded ?? null;
		// The stored IR may have been captured unsealed. Preview always plays it
		// as an active spell, stamped with a fresh activation each replay.
		this.#ir = playableIr(options.previewIr);
		this.#effectStyle = options.effectStyle ?? DEFAULT_EFFECT_STYLE;
		this.#glyphCtx = options.glyphCanvas.getContext('2d')!;
		this.#effectEngine = createCastEngine(options.effectCanvas, this.#effectStyle);
	}

	/**
	 * Starts the replay loop. Returns a teardown that cancels the pending frame
	 * and disposes the engine, so a closed card's WebGL context goes back rather
	 * than counting against the browser's handful of live ones.
	 */
	start(): () => void {
		this.restart();
		this.#rafId = requestAnimationFrame((timestamp) => this.#frame(timestamp));
		return () => {
			if (this.#rafId) cancelAnimationFrame(this.#rafId);
			this.#rafId = null;
			this.#effectEngine.dispose();
		};
	}

	/** Replays the effect from the beginning. */
	restart(): void {
		this.#activatedAt = performance.now();
		this.#endedFired = false;
		this.#effectEngine.reset();
	}

	/** How long this replay runs for, which the two engines do not agree on. */
	#castMs(): number {
		return this.#effectStyle === 'classic'
			? classicCastTotalMs(this.#ir.duration)
			: totalMsFor(this.#ir.duration);
	}

	#resize(): void {
		const rect = this.#shell.getBoundingClientRect();
		const size = Math.max(1, Math.round(Math.min(rect.width, rect.height)));
		if (this.#glyphCanvas.width === size && this.#glyphCanvas.height === size) {
			return;
		}
		this.#glyphCanvas.width = size;
		this.#glyphCanvas.height = size;
		this.#effectCanvas.width = size;
		this.#effectCanvas.height = size;
		const drawing = deserializeSpellPreset(this.#data, size);
		this.#strokes = [
			...drawing.strokes,
			...drawing.placements.flatMap((placement) => bakePlacementToStrokes(placement))
		];
		this.#ring = estimateRing(this.#strokes, size);
	}

	#drawInk(timestamp: number): void {
		const ctx = this.#glyphCtx;
		// Paint the paper first so the tilted glyph canvas reads as a lit sheet
		// receding into the void, matching the activated simulator surface.
		renderPaper(ctx, this.#glyphCanvas.width, this.#glyphCanvas.height);
		ctx.save();
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.strokeStyle = CONFIG.renderer.inkColor;
		ctx.lineWidth = Math.max(1.6, this.#glyphCanvas.width * 0.006);
		for (const stroke of this.#strokes) {
			if (stroke.points.length < 2) continue;
			ctx.beginPath();
			ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
			for (const point of stroke.points.slice(1)) {
				ctx.lineTo(point.x, point.y);
			}
			ctx.stroke();
		}
		ctx.restore();
		// R-01's charge on the ink. The whole stored drawing is the seal here, so
		// every stroke of it takes light, in the order it was drawn.
		drawSealIgnition(ctx, this.#activatedAt, this.#strokes, timestamp);
	}

	#frame(timestamp: number): void {
		this.#resize();
		this.#drawInk(timestamp);
		this.#effectEngine.render(
			{ ...this.#ir, activatedAt: this.#activatedAt },
			this.#ring,
			timestamp
		);
		const elapsed = performance.now() - this.#activatedAt;
		if (!this.#endedFired && elapsed > this.#castMs() + END_GRACE_MS) {
			this.#endedFired = true;
			this.#onEnded?.();
		}
		this.#rafId = requestAnimationFrame((next) => this.#frame(next));
	}
}
