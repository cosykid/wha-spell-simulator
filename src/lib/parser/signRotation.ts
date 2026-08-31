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

// The rotation a sign is matched at depends only on the candidate, so the whole
// dictionary of signs asks for the same copy. Building it per entry also handed
// the shape matcher a fresh stroke array each time, which defeated its own
// per-candidate render cache.
const rotatedCandidates = new WeakMap<SymbolCandidate, Map<number, SymbolCandidate>>();

function rotateCandidate(candidate: SymbolCandidate, rotationDeg: number): SymbolCandidate {
	const transform = rotationTransform(rotationDeg);
	if (!transform) {
		return candidate;
	}

	let byRotation = rotatedCandidates.get(candidate);
	if (!byRotation) {
		byRotation = new Map();
		rotatedCandidates.set(candidate, byRotation);
	}
	const cached = byRotation.get(rotationDeg);
	if (cached) {
		return cached;
	}

	// Rotate only the recognition copy. The public candidate keeps its original
	// ring-relative angle so the compiler can still use orientation as meaning.
	const center = candidate.center ?? centerOfBounds(candidate.bounds);
	const strokes = candidate.strokes.map((stroke) => ({
		...stroke,
		points: stroke.points.map((point) => rotatePoint(point, center, transform))
	}));
	const bounds = boundsForStrokes(strokes);

	const rotated = {
		...candidate,
		bounds,
		center: centerOfBounds(bounds),
		orientationDeg: normalizeAngleDeg((candidate.orientationDeg ?? 0) + rotationDeg),
		directedOrientationDeg: normalizeAngleDeg(
			(candidate.directedOrientationDeg ?? 0) + rotationDeg
		),
		strokes
	};
	byRotation.set(rotationDeg, rotated);
	return rotated;
}

export function recognitionPlanForSymbol(
	kind: RecognitionKind,
	entry: DictionaryEntry,
	candidate: SymbolCandidate
) {
	// Sigils are matched rotation-invariantly; the matcher reports the winning
	// rotation as the offset versus the canonical example.
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

	// Signs stay orientation-aware in this template fallback even though their
	// dictionary flag is rotation-invariant: a straight sign (e.g. `column`) is
	// shape-ambiguous under free rotation, so the fallback normalizes to the
	// bottom-of-ring frame and only allows a small tolerance. The learned model
	// (`mlRecognizer`) is what recognizes signs at any rotation and reports the
	// continuous `rotationOffsetDeg`; the flag drives its training augmentation.
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
