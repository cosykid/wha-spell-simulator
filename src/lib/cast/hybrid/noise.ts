/**
 * @file The noise the flow is folded out of, and the two helpers every term
 * needs. Split out of `flow.ts` because it is the half that has to be
 * transcribed into GLSL literally: `flow.glsl.ts` carries the same hash, the
 * same trilinear value noise on the same quintic fade, and the same four-sample
 * curl. **Change one and change the other.**
 */

export function fract(value: number): number {
	return value - Math.floor(value);
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
	const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

/** The shader's `hash13`, digit for digit. */
export function hash13(x: number, y: number, z: number): number {
	let px = fract(x * 0.1031);
	let py = fract(y * 0.1031);
	let pz = fract(z * 0.1031);
	const d = px * (pz + 31.32) + py * (py + 31.32) + pz * (px + 31.32);
	px += d;
	py += d;
	pz += d;
	return fract((px + py) * pz);
}

/** The shader's `vnoise`: trilinear value noise on a quintic fade, in -1..1. */
export function vnoise(x: number, y: number, z: number): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const iz = Math.floor(z);
	const fx = x - ix;
	const fy = y - iy;
	const fz = z - iz;
	const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
	const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
	const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
	const n000 = hash13(ix, iy, iz);
	const n100 = hash13(ix + 1, iy, iz);
	const n010 = hash13(ix, iy + 1, iz);
	const n110 = hash13(ix + 1, iy + 1, iz);
	const n001 = hash13(ix, iy, iz + 1);
	const n101 = hash13(ix + 1, iy, iz + 1);
	const n011 = hash13(ix, iy + 1, iz + 1);
	const n111 = hash13(ix + 1, iy + 1, iz + 1);
	const x00 = n000 + (n100 - n000) * ux;
	const x10 = n010 + (n110 - n010) * ux;
	const x01 = n001 + (n101 - n001) * ux;
	const x11 = n011 + (n111 - n011) * ux;
	const y0 = x00 + (x10 - x00) * uy;
	const y1 = x01 + (x11 - x01) * uy;
	return (y0 + (y1 - y0) * uz) * 2 - 1;
}

const EPS = 0.34;
const pot0 = { x: 0, y: 0, z: 0 };
const potX = { x: 0, y: 0, z: 0 };
const potY = { x: 0, y: 0, z: 0 };
const potZ = { x: 0, y: 0, z: 0 };

function potential(
	out: { x: number; y: number; z: number },
	x: number,
	y: number,
	z: number
): void {
	out.x = vnoise(x, y, z);
	out.y = vnoise(x + 41.7, y + 41.7, z + 41.7);
	out.z = vnoise(x - 27.3, y - 27.3, z - 27.3);
}

/** Curl of a noise potential: divergence free, so the flow folds instead of spraying. */
export function curlNoise(
	out: { x: number; y: number; z: number },
	x: number,
	y: number,
	z: number,
	gain: number
): void {
	potential(pot0, x, y, z);
	potential(potX, x + EPS, y, z);
	potential(potY, x, y + EPS, z);
	potential(potZ, x, y, z + EPS);
	out.x += (potY.z - pot0.z - (potZ.y - pot0.y)) * gain;
	out.y += (potZ.x - pot0.x - (potX.z - pot0.z)) * gain;
	out.z += (potX.y - pot0.y - (potY.x - pot0.x)) * gain;
}
