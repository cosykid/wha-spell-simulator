import { CONFIG } from '$lib/config.js';
import { activePortalPlane, convergenceFlow } from '$lib/renderer/effects/effectUtils.js';
import { drawGlowingStrokes } from '$lib/renderer/glyphOverlayRenderer.js';
import type { ElementId, Recognition, RingInfo, SealReading, SpellField } from '$lib/types.js';
import { buildSpellIR } from '$lib/ui/spellEffectLab.js';
import { vectorFromAngleDeg } from '$lib/utils/geometry.js';
import { renderPaper } from '$canvas/entities/paperEntity.js';
import { drawGuides } from '$canvas/guideRenderer.js';
import { createLabEngines, type LabEffectEngine, type LabEngine } from './lab-engines.js';
import { GOLDEN_FRAME_ATTRIBUTE, GOLDEN_FRAME_STEP_MS } from './lab-goldens.js';

/** Live control state the preview samples each animation frame. */
export interface LabState {
	values: Record<string, number>;
	element: ElementId;
	sigil: string;
	activatedAt: number;
	/** Which effect engine draws the frame. See `lab-engines.ts`. */
	engine: LabEngine;
	/** Force field synthesized from the selected sign preset, which the field engine renders. */
	field: SpellField;
	/** Gated reading of the same preset signs. `SpellIR.plan` follows from it, and the cast engine plays that. */
	reading: SealReading;
	/** The preset's signs, drawn as position/facing markers on the glyph. */
	presetSigns: Recognition[];
}

type SpellIR = ReturnType<typeof buildSpellIR>;

/**
 * The Spell Effect Lab's canvas preview: a self-contained render harness driving two stacked
 * canvases (a synthetic glyph + the effect layer) from a {@link LabState} getter. It owns the
 * effect engines, the resize bookkeeping, and the animation loop; the page keeps
 * the reactive control state and reads back through `resetParticles`/`start`.
 */
export class LabPreview {
	readonly #glyphCanvas: HTMLCanvasElement;
	readonly #effectCanvas: HTMLCanvasElement;
	readonly #shell: HTMLElement;
	readonly #getState: () => LabState;
	readonly #glyphCtx: CanvasRenderingContext2D;
	readonly #effectCtx: CanvasRenderingContext2D;
	readonly #engines: Record<LabEngine, LabEffectEngine>;
	#rafId: number | null = null;

	constructor(
		glyphCanvas: HTMLCanvasElement,
		effectCanvas: HTMLCanvasElement,
		shell: HTMLElement,
		getState: () => LabState
	) {
		this.#glyphCanvas = glyphCanvas;
		this.#effectCanvas = effectCanvas;
		this.#shell = shell;
		this.#getState = getState;
		this.#glyphCtx = glyphCanvas.getContext('2d')!;
		this.#effectCtx = effectCanvas.getContext('2d')!;
		this.#engines = createLabEngines(effectCanvas);
	}

	/** Begin the animation loop; returns a teardown that cancels the pending frame. */
	start(): () => void {
		this.#rafId = requestAnimationFrame((timestamp) => this.#frame(timestamp));
		return () => {
			if (this.#rafId) cancelAnimationFrame(this.#rafId);
			this.#rafId = null;
		};
	}

	/**
	 * Render straight to `frameMs` on a scripted clock, then stop, so a golden
	 * screenshot lands on the same frame every run. Test-only; the interactive
	 * lab always calls {@link start} instead.
	 *
	 * @example
	 * preview.renderGoldenFrame(600); // the frame 600ms into the cast
	 */
	renderGoldenFrame(frameMs: number): void {
		const activatedAt = this.#getState().activatedAt;
		const steps = Math.round(frameMs / GOLDEN_FRAME_STEP_MS);
		for (let step = 0; step <= steps; step += 1) {
			this.#renderAt(activatedAt + step * GOLDEN_FRAME_STEP_MS);
		}
		this.#effectCanvas.setAttribute(GOLDEN_FRAME_ATTRIBUTE, String(frameMs));
	}

	/** Drop accumulated render state so the next frame restarts the effect cleanly. */
	resetParticles(): void {
		for (const engine of Object.values(this.#engines)) {
			engine.reset();
		}
	}

	#buildRing(values: Record<string, number>): RingInfo {
		const width = this.#glyphCanvas.width;
		const height = this.#glyphCanvas.height;
		return {
			found: true,
			complete: true,
			center: { x: width / 2, y: height * 0.56 },
			radius: Math.min(width, height) * values.ringRadius,
			strokeIds: ['lab-ring']
		};
	}

	#buildRingStroke(ring: RingInfo) {
		const points = [];
		for (let index = 0; index <= 96; index += 1) {
			const angle = (index / 96) * Math.PI * 2;
			points.push({
				x: ring.center.x + Math.cos(angle) * ring.radius,
				y: ring.center.y + Math.sin(angle) * ring.radius
			});
		}
		return { id: 'lab-ring', points };
	}

	#buildSigilStroke(ring: RingInfo, values: Record<string, number>) {
		const radius = ring.radius * (0.16 + values.effectScale * 0.035);
		const points = [];
		// pentagram example
		for (let index = 0; index < 6; index += 1) {
			const angle = -Math.PI / 2 + index * ((Math.PI * 2) / 5);
			points.push({
				x: ring.center.x + Math.cos(angle) * radius,
				y: ring.center.y + Math.sin(angle) * radius
			});
		}
		return { id: 'lab-sigil', points };
	}

	#drawSyntheticGlyph(ring: RingInfo, timestamp: number, state: LabState) {
		const ctx = this.#glyphCtx;
		const width = this.#glyphCanvas.width;
		const height = this.#glyphCanvas.height;
		const ringStroke = this.#buildRingStroke(ring);
		const sigilStroke = this.#buildSigilStroke(ring, state.values);

		renderPaper(ctx, width, height);
		drawGuides(ctx, ring, width, height, CONFIG);

		ctx.save();
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.strokeStyle = CONFIG.renderer.inkColor;
		ctx.lineWidth = 4.4;
		ctx.beginPath();
		ctx.moveTo(ringStroke.points[0].x, ringStroke.points[0].y);
		for (const point of ringStroke.points.slice(1)) {
			ctx.lineTo(point.x, point.y);
		}
		ctx.stroke();

		ctx.beginPath();
		ctx.moveTo(sigilStroke.points[0].x, sigilStroke.points[0].y);
		for (const point of sigilStroke.points.slice(1)) {
			ctx.lineTo(point.x, point.y);
		}
		ctx.stroke();
		ctx.restore();

		drawGlowingStrokes(
			ctx,
			state.activatedAt,
			new Set(['lab-ring', 'lab-sigil']),
			[ringStroke, sigilStroke],
			state.values.duration * 1000,
			timestamp
		);

		this.#drawSignMarkers(ring, state.presetSigns);
	}

	// Preset signs are not drawn as glyphs; mark each one's ring position and
	// facing with a dot and arrow so the field's inputs stay visible.
	#drawSignMarkers(ring: RingInfo, signs: Recognition[]) {
		if (!signs.length) {
			return;
		}

		const ctx = this.#glyphCtx;
		ctx.save();
		ctx.strokeStyle = 'rgba(19, 118, 166, 0.85)';
		ctx.fillStyle = 'rgba(19, 118, 166, 0.85)';
		ctx.lineWidth = 2.4;
		ctx.lineCap = 'round';

		for (const sign of signs) {
			const radial = vectorFromAngleDeg(sign.angleDeg);
			const at = {
				x: ring.center.x + radial.x * sign.radiusNorm * ring.radius,
				y: ring.center.y + radial.y * sign.radiusNorm * ring.radius
			};
			const facing = vectorFromAngleDeg(sign.directedOrientationDeg);
			const tip = { x: at.x + facing.x * 26, y: at.y + facing.y * 26 };
			const left = { x: -facing.y, y: facing.x };

			ctx.beginPath();
			ctx.arc(at.x, at.y, 4.4, 0, Math.PI * 2);
			ctx.fill();
			ctx.beginPath();
			ctx.moveTo(at.x, at.y);
			ctx.lineTo(tip.x, tip.y);
			ctx.moveTo(tip.x, tip.y);
			ctx.lineTo(tip.x - facing.x * 8 + left.x * 5, tip.y - facing.y * 8 + left.y * 5);
			ctx.moveTo(tip.x, tip.y);
			ctx.lineTo(tip.x - facing.x * 8 - left.x * 5, tip.y - facing.y * 8 - left.y * 5);
			ctx.stroke();
		}

		ctx.restore();
	}

	// The dashed centerline the field's convergence manifestation compresses onto.
	// It reads field numbers, so it is drawn only when the field engine is.
	#drawConvergencePathGuide(spellIR: SpellIR, ring: RingInfo) {
		const convergence = spellIR.manifestations?.convergence;
		if (!convergence?.strength) {
			return;
		}

		const ctx = this.#effectCtx;
		const portal = activePortalPlane(this.#effectCanvas, ring);
		const flow = convergenceFlow(spellIR, portal, 0);
		const guideLength = ring.radius * (0.72 + spellIR.force * 0.46 + spellIR.range * 0.22);
		const end = {
			x: flow.origin.x + flow.direction.x * guideLength,
			y: flow.origin.y + flow.direction.y * guideLength
		};
		const radiusX = Math.max(5, flow.radiusX);
		const radiusY = Math.max(4, flow.radiusY);

		ctx.save();
		ctx.globalCompositeOperation = 'source-over';
		ctx.strokeStyle = 'rgba(19, 118, 166, 0.78)';
		ctx.lineWidth = 1.4;
		ctx.setLineDash([4, 5]);
		ctx.beginPath();
		ctx.moveTo(flow.origin.x, flow.origin.y);
		ctx.lineTo(end.x, end.y);
		ctx.stroke();
		ctx.beginPath();
		ctx.ellipse(end.x, end.y, radiusX, radiusY, 0, 0, Math.PI * 2);
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.beginPath();
		ctx.moveTo(end.x - 7, end.y);
		ctx.lineTo(end.x + 7, end.y);
		ctx.moveTo(end.x, end.y - 7);
		ctx.lineTo(end.x, end.y + 7);
		ctx.stroke();
		ctx.restore();
	}

	#resizeCanvases() {
		const rect = this.#shell.getBoundingClientRect();
		const width = Math.max(1, Math.round(rect.width));
		const height = Math.max(1, Math.round(rect.height));
		if (this.#glyphCanvas.width === width && this.#glyphCanvas.height === height) {
			return;
		}

		this.#glyphCanvas.width = width;
		this.#glyphCanvas.height = height;
		this.#effectCanvas.width = width;
		this.#effectCanvas.height = height;
		this.resetParticles();
	}

	#frame(timestamp: number) {
		this.#renderAt(timestamp);
		this.#rafId = requestAnimationFrame((next) => this.#frame(next));
	}

	#renderAt(timestamp: number) {
		this.#resizeCanvases();
		const state = this.#getState();
		const ring = this.#buildRing(state.values);
		const spellIR = buildSpellIR({
			values: state.values,
			element: state.element,
			sigil: state.sigil,
			activatedAt: state.activatedAt,
			config: CONFIG,
			field: state.field,
			reading: state.reading
		});
		this.#drawSyntheticGlyph(ring, timestamp, state);
		this.#engines[state.engine].render(spellIR, ring, timestamp);
		if (state.engine === 'field') {
			this.#drawConvergencePathGuide(spellIR, ring);
		}
	}
}
