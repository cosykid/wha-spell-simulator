import {
	drawCandidateDebug,
	drawRingDebug,
	drawStrokeIdDebug,
	drawGlowingStrokes
} from './glyphOverlayRenderer.js';
import { SpellEffectRenderer } from './spellEffectRenderer.js';
import { drawGuides } from '$canvas/guideRenderer.js';
import { renderPaper } from '$canvas/entities/paperEntity.js';
import { renderStrokeInk } from '$canvas/entities/strokeEntity.js';
import { drawSelection } from '$canvas/selectionRenderer.js';
import type {
	AppConfig,
	Stroke,
	SpellIR,
	RingInfo,
	ClassifiedDrawing,
	PlacementHandles
} from '../types.js';

function getActivatedStrokeIds(pipeline: ClassifiedDrawing | null | undefined): Set<string> {
	if (!pipeline) {
		return new Set();
	}

	const { ring, primarySigil, signs } = pipeline.glyphAST;
	return new Set([
		...(ring?.strokeIds ?? []),
		...(primarySigil?.strokeIds ?? []),
		...(signs ?? []).flatMap((sign) => sign.strokeIds ?? [])
	]);
}

interface GlyphRenderParams {
	strokes: Stroke[];
	currentStroke: Stroke | null | undefined;
	pipeline: ClassifiedDrawing | null | undefined;
	showGuides: boolean;
	showDebug: boolean;
	selection?: PlacementHandles | null;
}

interface ActivatedGlyphRenderParams {
	activatedAt: number | null | undefined;
	duration: number;
	strokes: Stroke[];
	pipeline: ClassifiedDrawing | null | undefined;
	timestamp: number;
}

interface EffectRenderParams {
	spellIR: SpellIR | null | undefined;
	ring: RingInfo | null | undefined;
	timestamp: number;
	showGuides: boolean;
}

interface CanvasRendererConstructorParams {
	glyphCanvas: HTMLCanvasElement;
	effectCanvas: HTMLCanvasElement;
	config: AppConfig;
}

export class CanvasRenderer {
	private glyphCanvas: HTMLCanvasElement;
	private glyphCtx: CanvasRenderingContext2D;
	private effectRenderer: SpellEffectRenderer;
	private config: AppConfig;

	constructor({ glyphCanvas, effectCanvas, config }: CanvasRendererConstructorParams) {
		this.glyphCanvas = glyphCanvas;
		this.glyphCtx = glyphCanvas.getContext('2d')!;
		this.effectRenderer = new SpellEffectRenderer(effectCanvas, config);
		this.config = config;
	}

	renderGlyph({
		strokes,
		currentStroke,
		pipeline,
		showGuides,
		showDebug,
		selection
	}: GlyphRenderParams): void {
		const width = this.glyphCanvas.width;
		const height = this.glyphCanvas.height;
		renderPaper(this.glyphCtx, width, height);

		if (showGuides) {
			drawGuides(this.glyphCtx, pipeline?.ring, width, height, this.config);
		}

		for (const stroke of strokes) {
			renderStrokeInk(this.glyphCtx, stroke, 0.94, this.config.renderer.inkColor, 4.4);
		}

		if (currentStroke) {
			renderStrokeInk(this.glyphCtx, currentStroke, 0.72, this.config.renderer.inkColor, 4.4);
		}

		if (showGuides && pipeline?.ring?.found) {
			drawRingDebug(this.glyphCtx, pipeline.ring);
		}

		if (showDebug) {
			drawCandidateDebug(
				this.glyphCtx,
				pipeline?.candidates,
				pipeline?.recognitions,
				this.config.renderer.effectSize
			);
			drawStrokeIdDebug(this.glyphCtx, strokes);
		}

		if (selection) {
			drawSelection(this.glyphCtx, selection);
		}
	}

	renderActivatedGlyph({
		activatedAt,
		duration,
		strokes,
		pipeline,
		timestamp
	}: ActivatedGlyphRenderParams): void {
		const activatedStrokeIds = getActivatedStrokeIds(pipeline);
		const glowDuration = Math.max(250, duration * 1000);
		// Delay the stroke glow until the canvas has finished tilting into the
		// screen, so it lights up together with the effect rather than during the
		// tilt. Matches the hold in SpellEffectRenderer.
		const glowActivatedAt =
			typeof activatedAt === 'number'
				? activatedAt + this.config.renderer.portalTiltMs
				: activatedAt;
		drawGlowingStrokes(
			this.glyphCtx,
			glowActivatedAt,
			activatedStrokeIds,
			strokes,
			glowDuration,
			timestamp
		);
	}

	renderEffect({ spellIR, ring, timestamp, showGuides }: EffectRenderParams): void {
		this.effectRenderer.render(spellIR, ring, timestamp, { showGuides });
	}
}
