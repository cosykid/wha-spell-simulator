/**
 * @file Deterministic value noise and curl for the CPU tracers. Hash-based, no
 * state, so a fresh replay and an incremental one sample the identical field.
 * Carried over from the approved prototype digit for digit.
 */

function hash3(x: number, y: number, z: number): number {
	let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
	h -= Math.floor(h);
	return h;
}

function fade(t: number): number {
	return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Trilinear value noise in [-1, 1]. */
export function vnoise(x: number, y: number, z: number): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const iz = Math.floor(z);
	const fx = fade(x - ix);
	const fy = fade(y - iy);
	const fz = fade(z - iz);
	const n000 = hash3(ix, iy, iz);
	const n100 = hash3(ix + 1, iy, iz);
	const n010 = hash3(ix, iy + 1, iz);
	const n110 = hash3(ix + 1, iy + 1, iz);
	const n001 = hash3(ix, iy, iz + 1);
	const n101 = hash3(ix + 1, iy, iz + 1);
	const n011 = hash3(ix, iy + 1, iz + 1);
	const n111 = hash3(ix + 1, iy + 1, iz + 1);
	const x00 = n000 + (n100 - n000) * fx;
	const x10 = n010 + (n110 - n010) * fx;
	const x01 = n001 + (n101 - n001) * fx;
	const x11 = n011 + (n111 - n011) * fx;
	return (
		(x00 + (x10 - x00) * fy + (x01 + (x11 - x01) * fy - (x00 + (x10 - x00) * fy)) * fz) * 2 - 1
	);
}

const E = 0.34;

function potX(x: number, y: number, z: number): number {
	return vnoise(x, y, z);
}
function potY(x: number, y: number, z: number): number {
	return vnoise(x + 41.7, y + 41.7, z + 41.7);
}
function potZ(x: number, y: number, z: number): number {
	return vnoise(x - 27.3, y - 27.3, z - 27.3);
}

/**
 * Curl of a noise potential into `out`: divergence-free, so the flow folds
 * instead of spraying. Forward differences without the divide, so one
 * turbulence gain means one thing everywhere it is read.
 */
export function curl(
	x: number,
	y: number,
	z: number,
	out: { x: number; y: number; z: number }
): void {
	const x0 = potX(x, y, z);
	const y0 = potY(x, y, z);
	const z0 = potZ(x, y, z);
	const zdy = potZ(x, y + E, z) - z0;
	const ydz = potY(x, y, z + E) - y0;
	const xdz = potX(x, y, z + E) - x0;
	const zdx = potZ(x + E, y, z) - z0;
	const ydx = potY(x + E, y, z) - y0;
	const xdy = potX(x, y + E, z) - x0;
	out.x = zdy - ydz;
	out.y = xdz - zdx;
	out.z = ydx - xdy;
}

/** The smoothstep both halves of the boundary math share. */
export function smooth01(t: number): number {
	const v = t < 0 ? 0 : t > 1 ? 1 : t;
	return v * v * (3 - 2 * v);
}
