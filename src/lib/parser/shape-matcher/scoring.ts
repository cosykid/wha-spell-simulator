import { clamp, normalizeAngleDeg } from '../../utils/geometry.js';
import type { Point, Stroke, TemplateMatchOptions } from '../../types.js';
import { renderNormalizedInk, scoreChamferDistance } from './ink.js';
import { normalizeStrokesForShape, pointCloudDistance } from './normalization.js';
import type {
	InkDistanceMap,
	NormalizedShape,
	RecognitionExample,
	ShapeMatcherResult
} from './types.js';

interface ExampleCacheEntry {
	shape: NormalizedShape;
	ink: InkDistanceMap;
}

const exampleCache = new WeakMap<RecognitionExample, ExampleCacheEntry>();

// Normalizing and rasterizing a candidate is the expensive half of a match and
// depends only on the stroke array and rotation, not the example. Recognition
// scores one candidate against every dictionary entry and example, so keying by
// the stroke array reuses the rasters across that whole sweep.
const candidateCache = new WeakMap<object, Map<number, ExampleCacheEntry>>();

function cachedCandidate(
	candidateStrokes: Array<Point[] | Stroke>,
	rotationDeg: number
): ExampleCacheEntry {
	let byRotation = candidateCache.get(candidateStrokes);
	if (!byRotation) {
		byRotation = new Map();
		candidateCache.set(candidateStrokes, byRotation);
	}
	let entry = byRotation.get(rotationDeg);
	if (!entry) {
		const shape = normalizeStrokesForShape(candidateStrokes, { rotationDeg });
		entry = { shape, ink: renderNormalizedInk(shape.strokes) };
		byRotation.set(rotationDeg, entry);
	}
	return entry;
}

function emptyMatcherResult(): ShapeMatcherResult {
	return {
		available: false,
		confidence: 0,
		$pDistance: 1,
		pScore: 0,
		directDistance: 1,
		rotationDeg: 0,
		recognitionRotationDeg: 0,
		chamferDistance: 1,
		chamferScore: 0,
		candidateExplainedRatio: 0,
		templateCoveredRatio: 0,
		unexplainedInkRatio: 1,
		missingInkRatio: 1,
		softDiceScore: 0,
		inkScore: 0,
		contaminationRisk: 1
	};
}

function rotationSet(options: TemplateMatchOptions): number[] {
	if (Array.isArray(options.allowedRotationsDeg) && options.allowedRotationsDeg.length) {
		return options.allowedRotationsDeg.map(normalizeAngleDeg);
	}
	if (options.rotationInvariant) {
		return [0, 45, 90, 135, 180, 225, 270, 315];
	}
	return [0];
}

function cachedExample(example: RecognitionExample): ExampleCacheEntry {
	const cached = exampleCache.get(example);
	if (cached) {
		return cached;
	}

	const shape = normalizeStrokesForShape(example.strokes);
	const ink = renderNormalizedInk(shape.strokes);
	const entry = { shape, ink };
	exampleCache.set(example, entry);
	return entry;
}

/**
 * Scores candidate strokes against one recognition example using point-cloud and ink distance.
 *
 * This is the low-level matcher used by the template recognizer and decomposition
 * scorer before higher-level structural and layer context are blended in.
 */
export function scoreRecognitionExample(
	candidateStrokes: Array<Point[] | Stroke>,
	example: RecognitionExample,
	options: TemplateMatchOptions = {}
): ShapeMatcherResult {
	if (!candidateStrokes.length || !example.strokes.length) {
		return emptyMatcherResult();
	}

	const exampleShape = cachedExample(example);
	if (!exampleShape.shape.pointCloud.length || !exampleShape.ink.ink) {
		return emptyMatcherResult();
	}

	const rotations = rotationSet({
		rotationInvariant: options.rotationInvariant ?? example.rotationInvariant,
		allowedRotationsDeg: options.allowedRotationsDeg ?? example.allowedRotationsDeg
	});
	let best = emptyMatcherResult();

	for (const rotationDeg of rotations) {
		const { shape: candidateShape, ink: candidateInk } = cachedCandidate(
			candidateStrokes,
			rotationDeg
		);
		const $pDistance = pointCloudDistance(candidateShape.pointCloud, exampleShape.shape.pointCloud);
		const pScore = clamp(1 - $pDistance);
		const chamfer = scoreChamferDistance(candidateInk, exampleShape.ink);
		const directScore = clamp(pScore * 0.55 + chamfer.chamferScore * 0.45);
		const directDistance = clamp(1 - directScore);

		if (directScore > best.confidence) {
			best = {
				available: true,
				confidence: directScore,
				$pDistance,
				pScore,
				directDistance,
				rotationDeg,
				recognitionRotationDeg: rotationDeg,
				...chamfer
			};
		}
	}

	return best;
}
