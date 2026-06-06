import type { Point, StrokeTemplate, SymbolCandidate } from '../../../types.js';
import { normalizedTemplateStrokes, rotateTemplatePoint } from '../../sigilDetector.js';
import type { Entity } from '../entity.js';

/**
 * Live inputs the overlay reads each frame. They are getters (not values) so the
 * entity always renders the latest analysis without being re-created: the scene's
 * animation loop calls {@link Entity.render} every frame and pulls fresh data.
 */
export interface ReferenceOverlayInputs {
	/** Whether the paper overlay is shown at all. */
	enabled(): boolean;
	/** Template of the entry selected as a tracing guide, if any. */
	traceTemplate(): StrokeTemplate | null | undefined;
	/** The current standalone candidate built from the drawn strokes. */
	candidate(): SymbolCandidate | null;
	/** Template of the best match, fitted to the candidate's bounds. */
	matchTemplate(): StrokeTemplate | null | undefined;
	/** Rotation applied to the best match when scoring it. */
	matchRotationDeg(): number;
	/** Whether the candidate was recognized (drives the bounds-box color). */
	recognized(): boolean;
}

/** Maps a normalized 0..1 template point into the candidate's canvas footprint. */
function templatePointToCanvas(
	point: Point,
	candidate: SymbolCandidate,
	rotationDeg: number
): Point {
	const rotated = rotateTemplatePoint(point, rotationDeg);
	const scale = Math.max(candidate.bounds.width, candidate.bounds.height, 1);
	return {
		x: candidate.center.x + (rotated.x - 0.5) * scale,
		y: candidate.center.y + (rotated.y - 0.5) * scale
	};
}

/** Draws a polyline through pre-projected canvas points. */
function strokePath(ctx: CanvasRenderingContext2D, points: Point[]): void {
	if (!points.length) {
		return;
	}
	ctx.beginPath();
	ctx.moveTo(points[0].x, points[0].y);
	for (let index = 1; index < points.length; index += 1) {
		ctx.lineTo(points[index].x, points[index].y);
	}
	ctx.stroke();
}

/** A faint, centered template the user can trace over. */
function drawTraceReference(ctx: CanvasRenderingContext2D, template: StrokeTemplate): void {
	const strokes = normalizedTemplateStrokes(template);
	if (!strokes.length) {
		return;
	}

	const center = { x: ctx.canvas.width / 2, y: ctx.canvas.height / 2 };
	const scale = Math.min(ctx.canvas.width, ctx.canvas.height) * 0.52;
	const project = (point: Point) => ({
		x: center.x + (point.x - 0.5) * scale,
		y: center.y + (point.y - 0.5) * scale
	});

	ctx.save();
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.lineWidth = 10;
	ctx.strokeStyle = 'rgba(255, 247, 219, 0.72)';
	ctx.shadowColor = 'rgba(36, 27, 22, 0.2)';
	ctx.shadowBlur = 8;
	for (const stroke of strokes) {
		strokePath(ctx, stroke.map(project));
	}

	ctx.shadowBlur = 0;
	ctx.lineWidth = 3;
	ctx.strokeStyle = 'rgba(184, 69, 49, 0.6)';
	ctx.setLineDash([10, 8]);
	for (const stroke of strokes) {
		strokePath(ctx, stroke.map(project));
	}
	ctx.restore();
}

/** The best-matching template fitted onto the candidate's footprint. */
function drawMatchOverlay(
	ctx: CanvasRenderingContext2D,
	candidate: SymbolCandidate,
	template: StrokeTemplate,
	rotationDeg: number
): void {
	const strokes = normalizedTemplateStrokes(template);
	if (!strokes.length) {
		return;
	}
	const project = (point: Point) => templatePointToCanvas(point, candidate, rotationDeg);

	ctx.save();
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.lineWidth = 6;
	ctx.strokeStyle = 'rgba(255, 247, 219, 0.92)';
	ctx.shadowColor = 'rgba(36, 27, 22, 0.42)';
	ctx.shadowBlur = 6;
	for (const stroke of strokes) {
		strokePath(ctx, stroke.map(project));
	}

	ctx.shadowBlur = 0;
	ctx.lineWidth = 2.25;
	ctx.strokeStyle = 'rgba(31, 111, 115, 0.95)';
	for (const stroke of strokes) {
		strokePath(ctx, stroke.map(project));
	}
	ctx.restore();
}

/** A dashed box around the candidate, tinted by whether it was recognized. */
function drawCandidateBounds(
	ctx: CanvasRenderingContext2D,
	candidate: SymbolCandidate,
	recognized: boolean
): void {
	const { bounds } = candidate;
	ctx.save();
	ctx.strokeStyle = recognized ? 'rgba(31, 111, 115, 0.72)' : 'rgba(184, 69, 49, 0.62)';
	ctx.lineWidth = 2;
	ctx.setLineDash([8, 6]);
	ctx.strokeRect(bounds.minX - 8, bounds.minY - 8, bounds.width + 16, bounds.height + 16);
	ctx.restore();
}

/**
 * The Sigil/Sign Detector Lab's "paper overlay": the optional tracing guide, the
 * best-match template fitted to the drawing, and the candidate's bounds box. This
 * used to be the page's bespoke `onFrame` callback; it now lives in the scene as a
 * single entity drawn on top of the ink.
 */
export function referenceOverlayEntity(inputs: ReferenceOverlayInputs): Entity {
	return {
		id: 'reference-overlay',
		z: 100,
		render(ctx) {
			if (!inputs.enabled()) {
				return;
			}

			const traceTemplate = inputs.traceTemplate();
			if (traceTemplate) {
				drawTraceReference(ctx, traceTemplate);
			}

			const candidate = inputs.candidate();
			if (!candidate) {
				return;
			}

			const matchTemplate = inputs.matchTemplate();
			if (matchTemplate) {
				drawMatchOverlay(ctx, candidate, matchTemplate, inputs.matchRotationDeg());
			}

			drawCandidateBounds(ctx, candidate, inputs.recognized());
		}
	};
}
