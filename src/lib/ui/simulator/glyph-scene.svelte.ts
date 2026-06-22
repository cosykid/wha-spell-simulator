import type { AppConfig, ClassifiedDrawing, SpellIR, Stroke } from '$lib/types.js';
import { drawGuides } from '$lib/ui/canvas/guideRenderer.js';
import { texturedPaperEntity } from '$lib/ui/canvas/entities/paperEntity.js';
import { renderStrokeInk } from '$lib/ui/canvas/entities/strokeEntity.js';
import { drawSelection } from '$lib/ui/canvas/selectionRenderer.js';
import type { Entity } from '$lib/ui/canvas/entity.js';
import { createScene, type Scene } from '$lib/ui/canvas/scene.svelte.js';
import {
	drawCandidateDebug,
	drawGlowingStrokes,
	drawRingDebug,
	drawStrokeIdDebug
} from '$lib/renderer/glyphOverlayRenderer.js';
import type { SimulatorDrawingState } from './drawing-state.svelte.js';
import { visibleCanvasShortAxis } from './layout.js';
import type { RecognitionPipeline } from './recognition-pipeline.svelte.js';
import type { SimulatorUiState } from './ui-state.svelte.js';

interface SimulatorGlyphSceneOptions {
	config: AppConfig;
	drawing: SimulatorDrawingState;
	recognition: RecognitionPipeline;
	ui: SimulatorUiState;
	currentStroke: () => Stroke | null;
}

function activatedStrokeIds(pipeline: ClassifiedDrawing | null | undefined): Set<string> {
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

function guideEntity({ config, recognition, ui }: SimulatorGlyphSceneOptions): Entity {
	return {
		id: 'simulator-guides',
		z: -80,
		render(ctx) {
			if (!ui.showGuides) {
				return;
			}
			drawGuides(
				ctx,
				recognition.pipeline?.ring,
				ctx.canvas.width,
				ctx.canvas.height,
				config,
				visibleCanvasShortAxis(ctx.canvas)
			);
		}
	};
}

function strokeLayerEntity({ config, drawing }: SimulatorGlyphSceneOptions): Entity {
	return {
		id: 'simulator-strokes',
		z: 0,
		render(ctx) {
			for (const stroke of drawing.renderInkStrokes()) {
				renderStrokeInk(ctx, stroke, 0.94, config.renderer.inkColor, 4.4);
			}
		}
	};
}

function placementLayerEntity({ drawing }: SimulatorGlyphSceneOptions): Entity {
	return {
		id: 'simulator-placements',
		z: 10,
		render(ctx, timestamp) {
			for (const placement of drawing.renderPlacementEntities()) {
				placement.render(ctx, timestamp);
			}
		}
	};
}

function currentStrokeEntity({ config, currentStroke }: SimulatorGlyphSceneOptions): Entity {
	return {
		id: 'simulator-current-stroke',
		z: 20,
		render(ctx) {
			const stroke = currentStroke();
			if (stroke) {
				renderStrokeInk(ctx, stroke, 0.72, config.renderer.inkColor, 4.4);
			}
		}
	};
}

function ringDebugEntity({ recognition, ui }: SimulatorGlyphSceneOptions): Entity {
	return {
		id: 'simulator-ring-debug',
		z: 50,
		render(ctx) {
			const ring = recognition.pipeline?.ring;
			if (ui.showGuides && ring?.found) {
				drawRingDebug(ctx, ring);
			}
		}
	};
}

function diagnosticsEntity({
	config,
	drawing,
	recognition,
	ui
}: SimulatorGlyphSceneOptions): Entity {
	return {
		id: 'simulator-diagnostics',
		z: 60,
		render(ctx) {
			if (!ui.showDiagnostics) {
				return;
			}
			const pipeline = recognition.pipeline;
			drawCandidateDebug(
				ctx,
				pipeline?.candidates,
				pipeline?.recognitions,
				config.renderer.effectSize
			);
			drawStrokeIdDebug(ctx, drawing.renderInkStrokes());
		}
	};
}

function selectionEntity({ drawing, ui }: SimulatorGlyphSceneOptions): Entity {
	return {
		id: 'simulator-selection',
		z: 90,
		render(ctx) {
			const selection = drawing.selectionHandles(ui.activeTool);
			if (selection) {
				drawSelection(ctx, selection);
			}
		}
	};
}

function activatedGlyphEntity({
	config,
	drawing,
	recognition
}: SimulatorGlyphSceneOptions): Entity {
	return {
		id: 'simulator-activated-glyph',
		z: 100,
		render(ctx, timestamp) {
			const spellIR: SpellIR | null | undefined = recognition.spellIR;
			if (!spellIR?.active) {
				return;
			}

			const glowActivatedAt =
				typeof spellIR.activatedAt === 'number'
					? spellIR.activatedAt + config.renderer.portalTiltMs
					: spellIR.activatedAt;
			drawGlowingStrokes(
				ctx,
				glowActivatedAt,
				activatedStrokeIds(recognition.pipeline),
				drawing.mergedStrokes(),
				Math.max(250, spellIR.duration * 1000),
				timestamp
			);
		}
	};
}

export function createSimulatorGlyphScene(options: SimulatorGlyphSceneOptions): Scene {
	return createScene([
		texturedPaperEntity('/images/background.jpg'),
		guideEntity(options),
		strokeLayerEntity(options),
		placementLayerEntity(options),
		currentStrokeEntity(options),
		ringDebugEntity(options),
		diagnosticsEntity(options),
		selectionEntity(options),
		activatedGlyphEntity(options)
	]);
}
