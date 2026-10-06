/**
 * The tracers' noise remembers its lattice hashes. Turbulence is part of the
 * replay contract, so a remembered hash has to be the hash, wherever the
 * samples wander and however often they evict each other from the memo.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { curl, vnoise } from '../src/lib/cast/volume/noise.js';
import { mulberry32 } from '../src/lib/cast/rng.js';

/** The noise as it stood before the memo, kept as the oracle. */
function hash3(x: number, y: number, z: number): number {
	let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
	h -= Math.floor(h);
	return h;
}

function fade(t: number): number {
	return t * t * t * (t * (t * 6 - 15) + 10);
}

function referenceNoise(x: number, y: number, z: number): number {
	const [ix, iy, iz] = [Math.floor(x), Math.floor(y), Math.floor(z)];
	const [fx, fy, fz] = [fade(x - ix), fade(y - iy), fade(z - iz)];
	const x00 = hash3(ix, iy, iz) + (hash3(ix + 1, iy, iz) - hash3(ix, iy, iz)) * fx;
	const x10 = hash3(ix, iy + 1, iz) + (hash3(ix + 1, iy + 1, iz) - hash3(ix, iy + 1, iz)) * fx;
	const x01 = hash3(ix, iy, iz + 1) + (hash3(ix + 1, iy, iz + 1) - hash3(ix, iy, iz + 1)) * fx;
	const x11 =
		hash3(ix, iy + 1, iz + 1) + (hash3(ix + 1, iy + 1, iz + 1) - hash3(ix, iy + 1, iz + 1)) * fx;
	return (
		(x00 + (x10 - x00) * fy + (x01 + (x11 - x01) * fy - (x00 + (x10 - x00) * fy)) * fz) * 2 - 1
	);
}

test('remembered lattice hashes sample the noise the sine would', () => {
	const rng = mulberry32(31);
	// Wide enough that samples keep evicting each other from the memo, and
	// straddling zero so negative lattice coordinates are exercised too.
	for (let i = 0; i < 20000; i += 1) {
		const x = (rng() - 0.5) * 400;
		const y = (rng() - 0.5) * 400;
		const z = (rng() - 0.5) * 400;
		assert.ok(Object.is(vnoise(x, y, z), referenceNoise(x, y, z)), `vnoise at ${x}, ${y}, ${z}`);
	}
	// And a tracer cloud's worth of nearby samples, which is where the memo hits.
	const out = { x: 0, y: 0, z: 0 };
	for (let i = 0; i < 5000; i += 1) {
		const [x, y, z] = [rng() * 3 - 1.5, rng() * 3 - 1.5, rng() * 2];
		curl(x, y, z, out);
		assert.ok(Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z));
		assert.ok(Object.is(vnoise(x, y, z), referenceNoise(x, y, z)));
	}
});
