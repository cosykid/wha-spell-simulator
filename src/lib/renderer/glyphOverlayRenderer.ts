import type {
	AppConfig,
	Stroke,
	RingInfo,
	SymbolCandidate,
	Recognition,
	Point,
	PlacementHandles,
	Vector
} from '../types.js';

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

interface StrokeDrawOptions {
	color?: string;
	lineWidth?: number;
	alpha?: number;
}

function drawSingleStroke(
	ctx: CanvasRenderingContext2D,
	stroke: Stroke,
	options: StrokeDrawOptions = {}
): void {
	if (!hasStrokePoints(stroke)) {
		return;
	}

	ctx.save();
	ctx.strokeStyle = options.color ?? '#241b16';
	ctx.lineWidth = options.lineWidth ?? 4.2;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.globalAlpha = options.alpha ?? 1;
	traceStrokePath(ctx, stroke);
	ctx.stroke();
	ctx.restore();
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

export function drawStrokes(
	ctx: CanvasRenderingContext2D,
	strokes: Stroke[],
	currentStroke: Stroke | null | undefined,
	config: AppConfig
): void {
	for (const stroke of strokes) {
		drawSingleStroke(ctx, stroke, {
			color: config.renderer.inkColor,
			lineWidth: 4.4,
			alpha: 0.94
		});
	}

	if (currentStroke) {
		drawSingleStroke(ctx, currentStroke, {
			color: config.renderer.inkColor,
			lineWidth: 4.4,
			alpha: 0.72
		});
	}
}

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

function drawHandleSquare(ctx: CanvasRenderingContext2D, point: Vector, size = 9): void {
	ctx.beginPath();
	ctx.rect(point.x - size / 2, point.y - size / 2, size, size);
	ctx.fill();
	ctx.stroke();
}

export function drawPlacementSelection(
	ctx: CanvasRenderingContext2D,
	handles: PlacementHandles | null | undefined
): void {
	if (!handles) {
		return;
	}

	ctx.save();
	ctx.strokeStyle = 'rgba(31, 111, 115, 0.85)';
	ctx.fillStyle = 'rgba(255, 251, 233, 0.96)';
	ctx.lineWidth = 1.5;

	ctx.setLineDash([6, 4]);
	ctx.beginPath();
	handles.corners.forEach((corner, index) => {
		if (index === 0) {
			ctx.moveTo(corner.x, corner.y);
		} else {
			ctx.lineTo(corner.x, corner.y);
		}
	});
	ctx.closePath();
	ctx.stroke();
	ctx.setLineDash([]);

	ctx.beginPath();
	ctx.moveTo(handles.topMid.x, handles.topMid.y);
	ctx.lineTo(handles.rotate.x, handles.rotate.y);
	ctx.stroke();

	for (const corner of handles.corners) {
		drawHandleSquare(ctx, corner);
	}
	for (const edge of handles.edgeHandles) {
		drawHandleSquare(ctx, edge);
	}

	ctx.beginPath();
	ctx.arc(handles.rotate.x, handles.rotate.y, 5.5, 0, Math.PI * 2);
	ctx.fill();
	ctx.stroke();
	ctx.restore();
}

export function drawCandidateDebug(
	ctx: CanvasRenderingContext2D,
	candidates: SymbolCandidate[] | null | undefined,
	recognitions: Recognition[] | null | undefined
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
		const label = accepted
			? `${recognition!.id} ${Math.round(recognition!.confidence * 100)}`
			: hasTentativeName
				? `${tentativeMatch!.id}? ${Math.round((tentativeMatch!.confidence ?? 0) * 100)}`
				: `${candidate.candidateId}`;
		ctx.fillText(label, candidate.bounds.minX, Math.max(12, candidate.bounds.minY - 5));
	}
	ctx.restore();
}
