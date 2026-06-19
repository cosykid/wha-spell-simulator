import { degreesToRadians, normalizeAngleDeg } from '../../utils/geometry.js';
import type { TemplateMatchOptions, Vector } from '../../types.js';
import type { RotationTransform } from './types.js';

/** Returns the rotation search space requested by a template match. */
export function rotationSet(options: TemplateMatchOptions): number[] {
	if (Array.isArray(options.allowedRotationsDeg) && options.allowedRotationsDeg.length) {
		return options.allowedRotationsDeg;
	}
	if (options.rotationInvariant) {
		return [0, 45, 90, 135, 180, 225, 270, 315];
	}
	return [0];
}

/** Converts a rotation angle into a reusable transform. */
export function rotationTransform(degrees: number): RotationTransform | null {
	if (!degrees) {
		return null;
	}

	const radians = degreesToRadians(degrees);
	return {
		cos: Math.cos(radians),
		sin: Math.sin(radians)
	};
}

/** Rotation magnitude normalized so 0 and 360 both have no penalty. */
export function normalizedRotationMagnitude(degrees: number): number {
	const normalized = normalizeAngleDeg(degrees);
	return Math.min(normalized, 360 - normalized) / 180;
}

/** Rotates a point around the center of normalized template space. */
export function rotatePoint(point: Vector, transform: RotationTransform | null): Vector {
	if (!transform) {
		return point;
	}

	const x = point.x - 0.5;
	const y = point.y - 0.5;
	return {
		x: x * transform.cos - y * transform.sin + 0.5,
		y: x * transform.sin + y * transform.cos + 0.5
	};
}
