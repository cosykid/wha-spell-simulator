/**
 * @file The seal-space vector math `cast/` runs on. `utils/geometry.ts` owns the
 * in-plane (`Vector`) helpers; this is their three-component counterpart, kept
 * here because the score and the sim are its only callers.
 */

import type { Vec3 } from '../types.js';

export const SEAL_UP: Vec3 = { x: 0, y: 0, z: 1 };

/** Below this a vector reads as absent rather than short. Matches the plan layer's floor. */
const NEGLIGIBLE = 1e-6;

export function magnitude3(v: Vec3): number {
	return Math.hypot(v.x, v.y, v.z);
}

/** Unit vector, or `fallback` when there is no direction to speak of. */
export function normalize3(v: Vec3, fallback: Vec3 = SEAL_UP): Vec3 {
	const length = magnitude3(v);
	if (length < NEGLIGIBLE) {
		return fallback;
	}
	return { x: v.x / length, y: v.y / length, z: v.z / length };
}

export function scale3(v: Vec3, factor: number): Vec3 {
	return { x: v.x * factor, y: v.y * factor, z: v.z * factor };
}

export function add3(a: Vec3, b: Vec3): Vec3 {
	return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function subtract3(a: Vec3, b: Vec3): Vec3 {
	return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function dot3(a: Vec3, b: Vec3): number {
	return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Whether a vector carries a direction at all. */
export function isPresent(v: Vec3): boolean {
	return magnitude3(v) > NEGLIGIBLE;
}
