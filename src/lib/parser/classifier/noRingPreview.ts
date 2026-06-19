import {
	allPoints,
	angleDegFromCenter,
	boundsForStrokes,
	centerOfBounds,
	clamp,
	directedStrokeAngle,
	dominantAxisOrientationDeg,
	endpointClosedness,
	strokeLength
} from '../../utils/geometry.js';
import { classifyStrokesAgainstRing } from '../coordinateNormalizer.js';
import { buildSymbolCandidates } from '../grouping/index.js';
import type { RecognitionExample } from '../shape-matcher/index.js';
import type {
	AppConfig,
	CleanedStroke,
	Dictionary,
	RingInfo,
	Stroke,
	SymbolCandidate
} from '../../types.js';
import type { NoRingPreview } from './types.js';

function buildNoRingPreviewCandidate(strokes: Stroke[]): SymbolCandidate | null {
	const points = allPoints(strokes);
	if (!points.length) {
		return null;
	}

	const bounds = boundsForStrokes(strokes);
	const center = centerOfBounds(bounds);
	const length = strokes.reduce((sum, stroke) => sum + strokeLength(stroke), 0);
	const size = Math.max(bounds.width, bounds.height, 1);
	const syntheticRingRadius = Math.max(size * 1.35, 1);
	const orientationDeg = dominantAxisOrientationDeg(points);
	const directedOrientationDeg = directedStrokeAngle(strokes);
	const compactPerimeter = Math.max(1, (bounds.width + bounds.height) * 2);
	const overdrawAmount = clamp(length / compactPerimeter - 0.72, 0, 1);

	return {
		candidateId: 'preview-symbol',
		strokeIds: strokes.map((stroke) => stroke.id),
		rawStrokeCount: strokes.length,
		cleanedStrokeCount: strokes.length,
		bounds,
		center,
		radiusNorm: 0.5,
		angleDeg: angleDegFromCenter(center, center),
		layer: 'any',
		nearBoundary: false,
		sizeNorm: size / Math.max(1, syntheticRingRadius * 2),
		lengthNorm: length / Math.max(1, Math.PI * 2 * syntheticRingRadius),
		orientationDeg,
		directedOrientationDeg,
		radialFacing: 'unclear',
		closedness: endpointClosedness(strokes, size),
		overdrawAmount,
		neatness: clamp(0.92 - overdrawAmount * 0.28 - Math.max(0, strokes.length - 4) * 0.035),
		strokes
	};
}

const sigilOnlyDictionaries = new WeakMap<Dictionary, Dictionary>();

function sigilOnlyDictionaryFor(dictionary: Dictionary): Dictionary {
	let sigilOnly = sigilOnlyDictionaries.get(dictionary);
	if (!sigilOnly) {
		sigilOnly = { sigils: dictionary.sigils, signs: [] };
		sigilOnlyDictionaries.set(dictionary, sigilOnly);
	}
	return sigilOnly;
}

/** Builds preview candidates when no real ring is detected yet. */
export function noRingPreview(
	cleanedStrokes: CleanedStroke[],
	dictionary: Dictionary,
	config: AppConfig,
	recognitionExamples: RecognitionExample[],
	guideRing: RingInfo | null = null
): NoRingPreview {
	if (guideRing) {
		const classifications = classifyStrokesAgainstRing(cleanedStrokes, guideRing, config);
		const candidates = buildSymbolCandidates(
			cleanedStrokes,
			classifications,
			guideRing,
			config,
			dictionary,
			recognitionExamples
		);
		return {
			classifications,
			candidates,
			recognitionDictionary: dictionary,
			recognitionExamples
		};
	}

	const sigilOnlyDictionary = sigilOnlyDictionaryFor(dictionary);
	const sigilExamples = recognitionExamples.filter((example) => example.kind === 'sigil');
	const candidate = buildNoRingPreviewCandidate(cleanedStrokes);
	if (!candidate) {
		return {
			classifications: [] as ReturnType<typeof classifyStrokesAgainstRing>,
			candidates: [] as SymbolCandidate[],
			recognitionDictionary: sigilOnlyDictionary,
			recognitionExamples: sigilExamples
		};
	}

	return {
		classifications: [] as ReturnType<typeof classifyStrokesAgainstRing>,
		candidates: [candidate],
		recognitionDictionary: sigilOnlyDictionary,
		recognitionExamples: sigilExamples
	};
}
