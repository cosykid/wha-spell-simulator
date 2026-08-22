/**
 * @file Canvas harness that replays a saved spell's effect for the library
 * book. Follows the Spell Effect Lab's preview pattern: the stored drawing is
 * inked onto a glyph canvas while the real {@link SpellEffectRenderer} plays
 * the stored IR over it, against a synthetic sealed ring. No recognition runs.
 *
 * Still on the field engine after the phase 5 cutover, so it moves to
 * `CastRenderer` with the rest of the deletion. See `docs/animation-redesign.md`.
 */
import { CONFIG } from '$lib/config.js';
import { bakePlacementToStrokes } from '$lib/input/shapeBaker.js';
import { resetParticleState } from '$lib/renderer/effects/effectUtils.js';
import { SpellEffectRenderer } from '$lib/renderer/spellEffectRenderer.js';
import { deserializeSpellPreset, type SpellPresetData } from '$lib/structures/spellPreset.js';
import type { RingInfo, SpellIR, Stroke } from '$lib/types.js';
import { renderPaper } from '$canvas/entities/paperEntity.js';

/** Padding after the spell's own duration before a replay counts as finished. */
const END_GRACE_MS = 1600;

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
	readonly #effectRenderer: SpellEffectRenderer;
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
		onEnded?: () => void;
	}) {
		this.#glyphCanvas = options.glyphCanvas;
		this.#effectCanvas = options.effectCanvas;
		this.#shell = options.shell;
		this.#data = options.data;
		this.#onEnded = options.onEnded ?? null;
		// The stored IR may have been captured unsealed. Preview always plays it
		// as an active spell, stamped with a fresh activation each replay.
		this.#ir = { ...options.previewIr, active: true, prepared: false };
		this.#glyphCtx = options.glyphCanvas.getContext('2d')!;
		this.#effectRenderer = new SpellEffectRenderer(options.effectCanvas, CONFIG);
	}

	/** Starts the replay loop. Returns a teardown that cancels the pending frame. */
	start(): () => void {
		this.restart();
		this.#rafId = requestAnimationFrame((timestamp) => this.#frame(timestamp));
		return () => {
			if (this.#rafId) cancelAnimationFrame(this.#rafId);
			this.#rafId = null;
		};
	}

	/** Replays the effect from the beginning. */
	restart(): void {
		this.#activatedAt = performance.now();
		this.#endedFired = false;
		this.#effectRenderer.lastSignature = null;
		this.#effectRenderer.lastTime = null;
		resetParticleState(this.#effectRenderer.state);
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

	#drawInk(): void {
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
	}

	#frame(timestamp: number): void {
		this.#resize();
		this.#drawInk();
		this.#effectRenderer.render(
			{ ...this.#ir, activatedAt: this.#activatedAt },
			this.#ring,
			timestamp
		);
		const elapsed = performance.now() - this.#activatedAt;
		if (!this.#endedFired && elapsed > this.#ir.duration * 1000 + END_GRACE_MS) {
			this.#endedFired = true;
			this.#onEnded?.();
		}
		this.#rafId = requestAnimationFrame((next) => this.#frame(next));
	}
}
