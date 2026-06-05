import {
	boundsForStrokes,
	centerOfBounds,
	degreesToRadians,
	normalizeAngleDeg
} from '../utils/geometry.js';
import type { DictionaryEntry, Point, RecognitionKind, SymbolCandidate, Vector } from '../types.js';

interface RotationTransform {
	cos: number;
	sin: number;
}

const CANONICAL_SIGN_ANGLE_DEG = 270;
const SIGN_ROTATION_TOLERANCE_DEG = 15;

// Based on what observed in fan's wiki: Sign templates are authored/registered
// as if the sign sits at the bottom of the ring.
// Rotate a copy of each sign candidate into that frame before template matching.
function signCandidateToTemplateRotationDeg(candidateAngleDeg: number): number {
	return normalizeAngleDeg(
		(candidateAngleDeg ?? CANONICAL_SIGN_ANGLE_DEG) - CANONICAL_SIGN_ANGLE_DEG
	);
}

// After the ring-relative rotation, only allow a small matching wiggle. Larger
// rotations would erase orientation, which is part of sign meaning.
function signRecognitionRotations(): number[] {
	return [normalizeAngleDeg(-SIGN_ROTATION_TOLERANCE_DEG), 0, SIGN_ROTATION_TOLERANCE_DEG];
}

function rotationTransform(degrees: number): RotationTransform | null {
	if (!degrees) {
		return null;
	}

	const radians = degreesToRadians(degrees);
	return {
		cos: Math.cos(radians),
		sin: Math.sin(radians)
	};
}

function rotatePoint(point: Point, center: Vector, transform: RotationTransform | null): Point {
	if (!transform) {
		return point;
	}

	const x = point.x - center.x;
	const y = point.y - center.y;
	return {
		x: center.x + x * transform.cos - y * transform.sin,
		y: center.y + x * transform.sin + y * transform.cos
	};
}

function rotateCandidate(candidate: SymbolCandidate, rotationDeg: number): SymbolCandidate {
	const transform = rotationTransform(rotationDeg);
	if (!transform) {
		return candidate;
	}

	// Rotate only the recognition copy. The public candidate keeps its original
	// ring-relative angle so the compiler can still use orientation as meaning.
	const center = candidate.center ?? centerOfBounds(candidate.bounds);
	const strokes = candidate.strokes.map((stroke) => ({
		...stroke,
		points: stroke.points.map((point) => rotatePoint(point, center, transform))
	}));
	const bounds = boundsForStrokes(strokes);

	return {
		...candidate,
		bounds,
		center: centerOfBounds(bounds),
		orientationDeg: normalizeAngleDeg((candidate.orientationDeg ?? 0) + rotationDeg),
		directedOrientationDeg: normalizeAngleDeg(
			(candidate.directedOrientationDeg ?? 0) + rotationDeg
		),
		strokes
	};
}

export function recognitionPlanForSymbol(
	kind: RecognitionKind,
	entry: DictionaryEntry,
	candidate: SymbolCandidate
) {
	// Only support sign rotation for now.
	if (kind !== 'sign') {
		return {
			candidate,
			baseRotationDeg: 0,
			options: {
				rotationInvariant: entry.recognitionRotationInvariant ?? true,
				allowedRotationsDeg: entry.allowedRotationsDeg
			}
		};
	}

	// Signs get normalized to the bottom-of-ring template frame, then the matcher
	// tests only the small tolerance rotations from signRecognitionRotations().
	const baseRotationDeg = signCandidateToTemplateRotationDeg(candidate.angleDeg);
	return {
		candidate: rotateCandidate(candidate, baseRotationDeg),
		baseRotationDeg,
		options: {
			rotationInvariant: false,
			allowedRotationsDeg: signRecognitionRotations()
		}
	};
}
