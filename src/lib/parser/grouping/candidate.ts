import {
	allPoints,
	angularDifference,
	boundsForStrokes,
	centerOfBounds,
	clamp,
	directedStrokeAngle,
	dominantAxisOrientationDeg,
	endpointClosedness,
	strokeLength
} from '../../utils/geometry.js';
import { summarizePolar } from '../coordinateNormalizer.js';
import type {
	AppConfig,
	CleanedStroke,
	Dictionary,
	RadialFacing,
	RingInfo,
	SymbolCandidate
} from '../../types.js';

/** Highest symbol stroke count allowed by dictionary templates plus tolerance. */
export function maxTemplateStrokeCount(dictionary: Dictionary): number {
	const counts = [...dictionary.sigils, ...dictionary.signs].map(
		(entry) => entry.strokeTemplate?.strokes?.length ?? 0
	);
	return Math.max(8, ...counts) * 2 + 4;
}

function classifyRadialFacing(directedAngle: number, radialAngle: number): RadialFacing {
	const outward = angularDifference(directedAngle, radialAngle);
	const inward = angularDifference(directedAngle, radialAngle + 180);
	const counterclockwise = angularDifference(directedAngle, radialAngle + 90);
	const clockwise = angularDifference(directedAngle, radialAngle - 90);
	const best = Math.min(outward, inward, counterclockwise, clockwise);

	if (best > 48) {
		return 'unclear';
	}
	if (best === outward) {
		return 'outward';
	}
	if (best === inward) {
		return 'inward';
	}
	if (best === counterclockwise) {
		return 'counterclockwise';
	}
	return 'clockwise';
}

/** Builds a public symbol candidate from grouped cleaned strokes. */
export function buildCandidate(
	strokes: CleanedStroke[],
	index: number,
	ring: RingInfo,
	config: AppConfig
): SymbolCandidate {
	const points = allPoints(strokes);
	const bounds = boundsForStrokes(strokes);
	const center = centerOfBounds(bounds);
	const polar = summarizePolar(center, ring, config);
	const length = strokes.reduce((sum, stroke) => sum + strokeLength(stroke), 0);
	const size = Math.max(bounds.width, bounds.height);
	const sizeNorm = size / Math.max(1, ring.radius * 2);
	const lengthNorm = length / Math.max(1, Math.PI * 2 * ring.radius);
	const orientationDeg = dominantAxisOrientationDeg(points);
	const directedOrientationDeg = directedStrokeAngle(strokes);
	const radialFacing = classifyRadialFacing(directedOrientationDeg, polar.angleDeg);
	const compactPerimeter = Math.max(1, (bounds.width + bounds.height) * 2);
	const overdrawAmount = clamp(length / compactPerimeter - 0.72, 0, 1);
	const closedness = endpointClosedness(strokes, Math.max(1, size));

	return {
		candidateId: `c${index + 1}`,
		strokeIds: strokes.map((stroke) => stroke.id),
		rawStrokeCount: strokes.length,
		cleanedStrokeCount: strokes.length,
		bounds,
		center,
		radiusNorm: polar.radiusNorm,
		angleDeg: polar.angleDeg,
		layer: polar.layer,
		nearBoundary: polar.nearBoundary,
		sizeNorm,
		lengthNorm,
		orientationDeg,
		directedOrientationDeg,
		radialFacing,
		closedness,
		overdrawAmount,
		neatness: clamp(0.92 - overdrawAmount * 0.28 - Math.max(0, strokes.length - 4) * 0.035),
		strokes
	};
}
