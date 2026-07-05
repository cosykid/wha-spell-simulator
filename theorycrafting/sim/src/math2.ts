/** Minimal 2D helpers for seal-plane geometry. Seal 2D (x, y) maps to world (x, z). */

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
/** CCW perpendicular — plays the role of ẑ × v in the seal plane. */
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

/** Deterministic RNG (mulberry32): seeded medium clouds and test traces. */
export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
