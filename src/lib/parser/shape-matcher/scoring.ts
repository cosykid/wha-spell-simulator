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

/** A stroke set normalized into the unit square, with its ink map rasterized. */
interface MatchShape {
	shape: NormalizedShape;
	ink: InkDistanceMap;
}

const exampleCache = new WeakMap<RecognitionExample, MatchShape>();

/**
 * Candidate renders, keyed by the stroke array a scoring pass hands in and then
 * by rotation.
 *
 * Every dictionary example asks the same candidate for the same handful of
 * rotations, and building one costs far more than comparing it, so without this
 * a single candidate is normalized and rasterized hundreds of times per pass.
 * The entries fall away with the strokes they were built from. Strokes must not
 * be mutated in place while a pass is scoring them.
 */
const candidateCache = new WeakMap<Array<Point[] | Stroke>, Map<number, MatchShape>>();

/** How a direct match blends the two shape signals. The skip test below reads them too. */
const POINT_CLOUD_WEIGHT = 0.55;
const CHAMFER_WEIGHT = 0.45;

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

function cachedExample(example: RecognitionExample): MatchShape {
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

function cachedCandidate(
	candidateStrokes: Array<Point[] | Stroke>,
	rotationDeg: number
): MatchShape {
	let byRotation = candidateCache.get(candidateStrokes);
	if (!byRotation) {
		byRotation = new Map();
		candidateCache.set(candidateStrokes, byRotation);
	}
	const cached = byRotation.get(rotationDeg);
	if (cached) {
		return cached;
	}

	const shape = normalizeStrokesForShape(candidateStrokes, { rotationDeg });
	const entry = { shape, ink: renderNormalizedInk(shape.strokes) };
	byRotation.set(rotationDeg, entry);
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

	const inkPasses = rotations.map((rotationDeg) => {
		const candidateShape = cachedCandidate(candidateStrokes, rotationDeg);
		return {
			rotationDeg,
			candidateShape,
			chamfer: scoreChamferDistance(candidateShape.ink, exampleShape.ink)
		};
	});
	// Grouping scores hundreds of groups per drawing and only ranks them, so it
	// lets the ink pass choose the rotation and pays for one point cloud.
	const searched = options.chamferLeadsRotation
		? [
				inkPasses.reduce((leader, pass) =>
					pass.chamfer.chamferScore > leader.chamfer.chamferScore ? pass : leader
				)
			]
		: inkPasses;

	for (const { rotationDeg, candidateShape, chamfer } of searched) {
		// The point cloud is the expensive half and a perfect one only adds
		// POINT_CLOUD_WEIGHT, so a rotation whose ink alone cannot pass the
		// rotation already in hand cannot win however well its cloud matches.
		if (POINT_CLOUD_WEIGHT + CHAMFER_WEIGHT * chamfer.chamferScore <= best.confidence) {
			continue;
		}
		const $pDistance = pointCloudDistance(
			candidateShape.shape.pointCloud,
			exampleShape.shape.pointCloud
		);
		const pScore = clamp(1 - $pDistance);
		const directScore = clamp(pScore * POINT_CLOUD_WEIGHT + chamfer.chamferScore * CHAMFER_WEIGHT);
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
