/**
 * @file Minimal 2D helpers for seal-plane geometry, ported from
 * theorycrafting/sim/src/math2.ts. Seal 2D (x, y) maps to world (x, z).
 */

export interface Vec2 {
	x: number;
	y: number;
}

export const v2 = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => v2(a.x + b.x, a.y + b.y);
export const sub = (a: Vec2, b: Vec2): Vec2 => v2(a.x - b.x, a.y - b.y);
export const scale = (a: Vec2, s: number): Vec2 => v2(a.x * s, a.y * s);
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const norm = (a: Vec2): Vec2 => {
	const l = len(a);
	return l > 1e-9 ? scale(a, 1 / l) : v2(0, 0);
};
/** CCW perpendicular, playing the role of ẑ × v in the seal plane. */
export const perp = (a: Vec2): Vec2 => v2(-a.y, a.x);
export const fromAngle = (rad: number): Vec2 => v2(Math.cos(rad), Math.sin(rad));
export const angleOf = (a: Vec2): number => Math.atan2(a.y, a.x);
export const deg = (d: number): number => (d * Math.PI) / 180;

/** Shortest angular distance in [0, π]. */
export const angDist = (a: number, b: number): number => {
	let d = Math.abs(a - b) % (2 * Math.PI);
	if (d > Math.PI) d = 2 * Math.PI - d;
	return d;
};

export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

export const smoothstep = (e0: number, e1: number, x: number): number => {
	const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
	return t * t * (3 - 2 * t);
};

/** Deterministic RNG (mulberry32) for seeded medium clouds and tests. */
export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Mutable 3D vector for field sampling, replacing THREE.Vector3 so the core
 * stays renderer-free and unit-testable in node.
 */
export interface Vec3 {
	x: number;
	y: number;
	z: number;
}

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export function setV3(out: Vec3, x: number, y: number, z: number): Vec3 {
	out.x = x;
	out.y = y;
	out.z = z;
	return out;
}

export const lenV3 = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);

export function scaleV3(out: Vec3, s: number): Vec3 {
	out.x *= s;
	out.y *= s;
	out.z *= s;
	return out;
}
