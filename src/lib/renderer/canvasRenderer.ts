import {
	drawCandidateDebug,
	drawRingDebug,
	drawStrokeIdDebug,
	drawStrokes,
	drawGlowingStrokes
} from './glyphOverlayRenderer.js';
import { drawGuides, drawPaper } from './paperRenderer.js';
import { SpellEffectRenderer } from './spellEffectRenderer.js';
import type { AppConfig, Stroke, SpellIR, RingInfo, ClassifiedDrawing } from '../types.js';

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
		showDebug
	}: GlyphRenderParams): void {
		const width = this.glyphCanvas.width;
		const height = this.glyphCanvas.height;
		drawPaper(this.glyphCtx, width, height);

		if (showGuides) {
			drawGuides(this.glyphCtx, pipeline?.ring, width, height, this.config);
		}

		drawStrokes(this.glyphCtx, strokes, currentStroke, this.config);

		if (showGuides && pipeline?.ring?.found) {
			drawRingDebug(this.glyphCtx, pipeline.ring);
		}

		if (showDebug) {
			drawCandidateDebug(this.glyphCtx, pipeline?.candidates, pipeline?.recognitions);
			drawStrokeIdDebug(this.glyphCtx, strokes);
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
		drawGlowingStrokes(
			this.glyphCtx,
			activatedAt,
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
