import type { Stroke, RingInfo, SymbolCandidate, Recognition, Point } from '../types.js';

// ---------------------------------------------------------------------------
// Glow layer descriptors
// ---------------------------------------------------------------------------

interface GlowParams {
	pulse: number;
	flicker: number;
	glowAlpha: number;
}

interface GlowLayer {
	shadowColor: string;
	shadowBlur: (params: GlowParams) => number;
	strokeStyle: (params: GlowParams) => string;
	lineWidth: (params: GlowParams) => number;
}

const GLOW_LAYERS: GlowLayer[] = [
	{
		shadowColor: 'rgb(110, 185, 212)',
		shadowBlur: ({ pulse, flicker, glowAlpha }) => (24 + pulse * 18 + flicker * 10) * glowAlpha,
		strokeStyle: ({ pulse, glowAlpha }) =>
			`rgba(120, 220, 255, ${(0.18 + pulse * 0.12) * glowAlpha})`,
		lineWidth: ({ pulse, glowAlpha }) => 4 + (8 + pulse * 2) * glowAlpha
	},
	{
		shadowColor: 'rgb(117, 150, 161)',
		shadowBlur: ({ pulse, glowAlpha }) => (10 + pulse * 6) * glowAlpha,
		strokeStyle: ({ pulse, glowAlpha }) =>
			`rgba(187, 225, 237, ${(0.88 + pulse * 0.12) * glowAlpha})`,
		lineWidth: ({ pulse, glowAlpha }) => 1.8 + (2 + pulse * 0.6) * glowAlpha
	}
];

// ---------------------------------------------------------------------------
// Stroke path helpers
// ---------------------------------------------------------------------------

function hasStrokePoints(stroke: Stroke | null | undefined): boolean {
	return Boolean(stroke?.points?.length);
}

function traceStrokePath(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
	const firstPoint = stroke.points[0];
	ctx.beginPath();
	ctx.moveTo(firstPoint.x, firstPoint.y);
	for (let index = 1; index < stroke.points.length; index += 1) {
		const point = stroke.points[index];
		ctx.lineTo(point.x, point.y);
	}
}

function strokeLabelAnchor(stroke: Stroke): Point | null {
	if (!hasStrokePoints(stroke)) {
		return null;
	}
	if (stroke.points.length === 1) {
		return stroke.points[0];
	}

	let totalLength = 0;
	for (let index = 1; index < stroke.points.length; index += 1) {
		const previous = stroke.points[index - 1];
		const current = stroke.points[index];
		totalLength += Math.hypot(current.x - previous.x, current.y - previous.y);
	}

	const targetLength = totalLength / 2;
	let walkedLength = 0;
	for (let index = 1; index < stroke.points.length; index += 1) {
		const previous = stroke.points[index - 1];
		const current = stroke.points[index];
		const segmentLength = Math.hypot(current.x - previous.x, current.y - previous.y);
		if (walkedLength + segmentLength >= targetLength) {
			const local = segmentLength <= 0 ? 0 : (targetLength - walkedLength) / segmentLength;
			return {
				x: previous.x + (current.x - previous.x) * local,
				y: previous.y + (current.y - previous.y) * local
			};
		}
		walkedLength += segmentLength;
	}

	return stroke.points[stroke.points.length - 1];
}

function clampLabelPosition(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number
): { x: number; y: number } {
	return {
		x: Math.max(4, Math.min(ctx.canvas.width - width - 4, x)),
		y: Math.max(height + 4, Math.min(ctx.canvas.height - 4, y))
	};
}

function drawGlowingStrokeLayer(
	ctx: CanvasRenderingContext2D,
	stroke: Stroke,
	glow: GlowParams,
	layer: GlowLayer
): void {
	ctx.save();
	ctx.globalCompositeOperation = 'lighter';
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.shadowBlur = layer.shadowBlur(glow);
	ctx.shadowColor = layer.shadowColor;
	ctx.strokeStyle = layer.strokeStyle(glow);
	ctx.lineWidth = layer.lineWidth(glow);
	traceStrokePath(ctx, stroke);
	ctx.stroke();
	ctx.restore();
}

function drawSingleGlowingStroke(
	ctx: CanvasRenderingContext2D,
	stroke: Stroke,
	timestamp: number,
	glowAlpha: number = 1
): void {
	if (!hasStrokePoints(stroke)) {
		return;
	}

	const glow: GlowParams = {
		pulse: 0.5 + Math.sin(timestamp * 0.004) * 0.5,
		flicker: Math.random() * 0.08,
		glowAlpha
	};

	for (const layer of GLOW_LAYERS) {
		drawGlowingStrokeLayer(ctx, stroke, glow, layer);
	}
}

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

function activeGlowStrokes(activatedStrokeIds: Set<string>, strokes: Stroke[]): Stroke[] {
	const glowingStrokes: Stroke[] = [];

	for (const stroke of strokes) {
		if (activatedStrokeIds.has(stroke.id)) {
			glowingStrokes.push(stroke);
		}
	}

	return glowingStrokes;
}

function glowAlphaAt(timestamp: number, activatedAt: number, duration: number): number {
	const elapsed = timestamp - activatedAt;
	if (elapsed < 0) {
		// Activation is still in the future (the canvas is tilting in); no glow yet.
		return 0;
	}
	const t = Math.min(1, elapsed / duration);
	return Math.pow(1 - t, 2);
}

export function drawGlowingStrokes(
	ctx: CanvasRenderingContext2D,
	activatedAt: number | null | undefined,
	activatedStrokeIds: Set<string> | null | undefined,
	strokes: Stroke[],
	duration: number,
	timestamp: number = performance.now()
): void {
	if (!activatedStrokeIds?.size || !activatedAt) {
		return;
	}

	const glowAlpha = glowAlphaAt(timestamp, activatedAt, duration);
	if (glowAlpha <= 0) {
		return;
	}

	for (const stroke of activeGlowStrokes(activatedStrokeIds, strokes)) {
		drawSingleGlowingStroke(ctx, stroke, timestamp, glowAlpha);
	}
}

export function drawRingDebug(
	ctx: CanvasRenderingContext2D,
	ring: RingInfo | null | undefined
): void {
	if (!ring?.found) {
		return;
	}

	ctx.save();
	ctx.lineWidth = 2;
	ctx.strokeStyle = ring.complete ? 'rgba(184, 69, 49, 0.72)' : 'rgba(31, 111, 115, 0.72)';
	ctx.setLineDash(ring.complete ? [] : [10, 10]);
	ctx.beginPath();
	ctx.arc(ring.center.x, ring.center.y, ring.radius, 0, Math.PI * 2);
	ctx.stroke();

	ctx.setLineDash([]);
	ctx.fillStyle = 'rgba(36, 27, 22, 0.62)';
	ctx.beginPath();
	ctx.arc(ring.center.x, ring.center.y, 4, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

export function drawStrokeIdDebug(
	ctx: CanvasRenderingContext2D,
	strokes: Stroke[] | null | undefined
): void {
	ctx.save();
	ctx.textBaseline = 'middle';
	ctx.lineWidth = 1;

	for (const stroke of strokes ?? []) {
		const anchor = strokeLabelAnchor(stroke);
		if (!anchor || !stroke.id) {
			continue;
		}

		const label = stroke.id;
		const paddingX = 5;
		const paddingY = 3;
		const textMetrics = ctx.measureText(label);
		const boxWidth = Math.ceil(textMetrics.width + paddingX * 2);
		const boxHeight = 18;
		const position = clampLabelPosition(ctx, anchor.x + 7, anchor.y - 9, boxWidth, boxHeight);

		ctx.fillStyle = 'rgba(255, 251, 233, 0.88)';
		ctx.strokeStyle = 'rgba(36, 27, 22, 0.34)';
		ctx.beginPath();
		ctx.roundRect(position.x, position.y - boxHeight / 2, boxWidth, boxHeight, 5);
		ctx.fill();
		ctx.stroke();

		ctx.fillStyle = 'rgba(36, 27, 22, 0.86)';
		ctx.fillText(label, position.x + paddingX, position.y + paddingY - 2);
	}

	ctx.restore();
}

function confidencePercent(confidence: number | null | undefined): number {
	return Math.round((confidence ?? 0) * 100);
}

/** Subset of `renderer.effectSize` config the overlay needs to read sigil size. */
interface SizeDiagnosticsConfig {
	defaultReferenceSizeNorm: number;
}

// Shows how big a sigil or sign was drawn relative to its own regular size, the
// same signal the compiler turns into spell strength. Recognition normalizes size
// away for identity, so this is read from the raw candidate footprint
// (`sizeNorm`) against the glyph's `referenceSizeNorm`.
function sizeStrengthLabel(
	candidate: SymbolCandidate,
	recognition: Recognition,
	effectSize: SizeDiagnosticsConfig | undefined
): string | null {
	if (recognition.kind !== 'sigil' && recognition.kind !== 'sign') {
		return null;
	}
	const reference = recognition.referenceSizeNorm ?? effectSize?.defaultReferenceSizeNorm;
	if (!reference || reference <= 0) {
		return null;
	}
	const ratio = candidate.sizeNorm / reference;
	const tag = ratio > 1.25 ? 'strong' : ratio < 0.8 ? 'weak' : 'regular';
	return `×${ratio.toFixed(2)} ${tag}`;
}

function candidateDebugLabels(
	candidate: SymbolCandidate,
	recognition: Recognition | undefined,
	effectSize: SizeDiagnosticsConfig | undefined
): string[] {
	if (!recognition) {
		return [candidate.candidateId];
	}

	const ml = recognition.diagnostics?.ml;
	const topTemplateMatch =
		recognition.diagnostics?.topMatches?.find((match) => match.source !== 'ml') ??
		recognition.diagnostics?.topMatches?.[0] ??
		recognition.diagnostics?.bestGuess;

	if (recognition.recognized) {
		const source =
			ml?.accepted || recognition.diagnostics?.topMatches?.[0]?.source === 'ml' ? 'ML' : 'T';
		const id = recognition.id ?? 'unknown';
		const labels = [`${source} ${id} ${confidencePercent(recognition.confidence)}`];
		const sizeLabel = sizeStrengthLabel(candidate, recognition, effectSize);
		if (sizeLabel) {
			labels.push(sizeLabel);
		}
		if (ml && !ml.accepted) {
			if (ml.available) {
				const mlId = ml.id ?? ml.topMatches[0]?.id ?? 'unknown';
				labels.push(`ML? ${mlId} ${confidencePercent(ml.confidence)}`);
			} else {
				labels.push(`ML off ${ml.reason ?? 'unavailable'}`);
			}
		}
		return labels;
	}

	const labels: string[] = [];
	if (topTemplateMatch?.id) {
		labels.push(`T? ${topTemplateMatch.id} ${confidencePercent(topTemplateMatch.confidence)}`);
	}
	if (ml) {
		if (ml.available) {
			const mlId = ml.id ?? ml.topMatches[0]?.id ?? 'unknown';
			labels.push(`${ml.accepted ? 'ML' : 'ML?'} ${mlId} ${confidencePercent(ml.confidence)}`);
		} else {
			labels.push(`ML off ${ml.reason ?? 'unavailable'}`);
		}
	}

	return labels.length ? labels : [candidate.candidateId];
}

function drawCandidateDebugLabel(
	ctx: CanvasRenderingContext2D,
	labels: string[],
	x: number,
	y: number
): void {
	labels.forEach((label, index) => {
		ctx.fillText(label, x, y + index * 12);
	});
}

export function drawCandidateDebug(
	ctx: CanvasRenderingContext2D,
	candidates: SymbolCandidate[] | null | undefined,
	recognitions: Recognition[] | null | undefined,
	effectSize?: SizeDiagnosticsConfig
): void {
	const byCandidate = new Map(
		(recognitions ?? []).map((recognition) => [recognition.candidateId, recognition])
	);

	ctx.save();
	ctx.lineWidth = 1.5;
	for (const candidate of candidates ?? []) {
		const recognition = byCandidate.get(candidate.candidateId);
		const accepted = recognition?.recognized;
		const tentativeMatch =
			recognition?.diagnostics?.topMatches?.[0] ?? recognition?.diagnostics?.bestGuess;
		const hasTentativeName = Boolean(tentativeMatch?.id);
		ctx.strokeStyle = accepted
			? 'rgba(31, 111, 115, 0.82)'
			: hasTentativeName
				? 'rgba(156, 110, 35, 0.78)'
				: 'rgba(184, 69, 49, 0.74)';
		ctx.fillStyle = accepted
			? 'rgba(31, 111, 115, 0.92)'
			: hasTentativeName
				? 'rgba(156, 110, 35, 0.94)'
				: 'rgba(184, 69, 49, 0.92)';
		ctx.strokeRect(
			candidate.bounds.minX,
			candidate.bounds.minY,
			candidate.bounds.width,
			candidate.bounds.height
		);
		const labels = candidateDebugLabels(candidate, recognition, effectSize);
		drawCandidateDebugLabel(
			ctx,
			labels,
			candidate.bounds.minX,
			Math.max(12, candidate.bounds.minY - 5)
		);
	}
	ctx.restore();
}
