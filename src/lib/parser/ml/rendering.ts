import { boundsForStrokes } from '../../utils/geometry.js';
import type { DictionaryEntry, Point, SymbolCandidate } from '../../types.js';
import type { MlConfig } from './types.js';

interface RenderableCandidate {
	bounds: SymbolCandidate['bounds'];
	strokes: Array<{ points: Point[] }>;
}

function makeCanvas(size: number): HTMLCanvasElement | OffscreenCanvas {
	if (typeof OffscreenCanvas !== 'undefined') {
		return new OffscreenCanvas(size, size);
	}
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	return canvas;
}

/** Rasterizes a symbol candidate into the normalized tensor expected by the ONNX model. */
export function renderCandidateTensor(
	candidate: RenderableCandidate,
	config: MlConfig
): Float32Array {
	const renderScale = 2;
	const size = config.inputSize;
	const canvasSize = size * renderScale;
	const canvas = makeCanvas(canvasSize);
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) {
		throw new Error('Could not create 2D canvas context for ML recognition.');
	}

	const marginPx = (canvasSize * config.margin) / 2;
	const usable = canvasSize - marginPx * 2;
	const bounds = candidate.bounds;
	const scale = Math.max(bounds.width, bounds.height, 1);

	ctx.fillStyle = 'black';
	ctx.fillRect(0, 0, canvasSize, canvasSize);
	ctx.strokeStyle = 'white';
	ctx.fillStyle = 'white';
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.lineWidth = config.strokeWidth * renderScale;

	const project = (point: { x: number; y: number }) => ({
		x: marginPx + ((point.x - bounds.minX) / scale) * (usable - 1),
		y: marginPx + ((point.y - bounds.minY) / scale) * (usable - 1)
	});

	for (const stroke of candidate.strokes) {
		if (!stroke.points.length) {
			continue;
		}
		if (stroke.points.length === 1) {
			const point = project(stroke.points[0]);
			const radius = config.strokeWidth * renderScale;
			ctx.beginPath();
			ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
			ctx.fill();
			continue;
		}
		ctx.beginPath();
		const first = project(stroke.points[0]);
		ctx.moveTo(first.x, first.y);
		for (let i = 1; i < stroke.points.length; i += 1) {
			const point = project(stroke.points[i]);
			ctx.lineTo(point.x, point.y);
		}
		ctx.stroke();
	}

	const imageData = ctx.getImageData(0, 0, canvasSize, canvasSize).data;
	const tensor = new Float32Array(size * size);

	for (let y = 0; y < size; y += 1) {
		for (let x = 0; x < size; x += 1) {
			let total = 0;
			for (let dy = 0; dy < renderScale; dy += 1) {
				for (let dx = 0; dx < renderScale; dx += 1) {
					const sx = x * renderScale + dx;
					const sy = y * renderScale + dy;
					total += imageData[(sy * canvasSize + sx) * 4] ?? 0;
				}
			}
			const pixel = total / (255 * renderScale * renderScale);
			tensor[y * size + x] = (pixel - 0.5) / 0.5;
		}
	}

	return tensor;
}

/** Packs multiple candidate tensors into one batch buffer. */
export function renderCandidatesTensor(
	candidates: SymbolCandidate[],
	config: MlConfig
): Float32Array {
	const pixelsPerCandidate = config.inputSize * config.inputSize;
	const batch = new Float32Array(candidates.length * pixelsPerCandidate);
	for (let index = 0; index < candidates.length; index += 1) {
		batch.set(renderCandidateTensor(candidates[index], config), index * pixelsPerCandidate);
	}
	return batch;
}

const CANONICAL_TEMPLATE_SCALE = 256;

/** Creates a renderable candidate from a dictionary template for pose calibration. */
export function canonicalCandidateFromEntry(entry: DictionaryEntry): RenderableCandidate | null {
	const templateStrokes = (entry.strokeTemplate?.strokes ?? []).filter((points) => points.length);
	if (!templateStrokes.length) {
		return null;
	}
	const strokes = templateStrokes.map((points) => ({
		points: points.map((point) => ({
			x: point.x * CANONICAL_TEMPLATE_SCALE,
			y: point.y * CANONICAL_TEMPLATE_SCALE
		}))
	}));
	return { strokes, bounds: boundsForStrokes(strokes) };
}
