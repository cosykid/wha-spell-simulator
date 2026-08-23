/**
 * @file The parcel stamp: four torn brush marks baked into one atlas at load.
 *
 * A crisp disc is what makes a particle system read as a particle system, so
 * every mark here is eroded by its own fbm before it is thresholded, and the
 * threshold is soft, so the silhouette is ragged and the interior is uneven.
 * Channels: `r` unused, `g` the tight core mask, `b` a fine grain the fragment
 * program modulates opacity with, `a` the body.
 */

import * as THREE from 'three';

const TILE = 128;
const ATLAS = TILE * 2;

function hash2(x: number, y: number, seed: number): number {
	const h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
	return h - Math.floor(h);
}

function smoother(t: number): number {
	return t * t * t * (t * (t * 6 - 15) + 10);
}

function valueNoise(x: number, y: number, seed: number): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const fx = smoother(x - ix);
	const fy = smoother(y - iy);
	const a = hash2(ix, iy, seed);
	const b = hash2(ix + 1, iy, seed);
	const c = hash2(ix, iy + 1, seed);
	const d = hash2(ix + 1, iy + 1, seed);
	return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

function fbm(x: number, y: number, seed: number): number {
	let sum = 0;
	let amp = 0.5;
	let freq = 1;
	for (let octave = 0; octave < 5; octave += 1) {
		sum += valueNoise(x * freq, y * freq, seed + octave * 13.3) * amp;
		amp *= 0.52;
		freq *= 2.07;
	}
	return sum;
}

function clamp01(value: number): number {
	return value < 0 ? 0 : value > 1 ? 1 : value;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
	const t = clamp01((value - edge0) / (edge1 - edge0));
	return t * t * (3 - 2 * t);
}

/** One torn mark, written into `data` at the tile origin. */
function paintTile(data: Uint8Array, tileX: number, tileY: number, seed: number) {
	for (let y = 0; y < TILE; y += 1) {
		for (let x = 0; x < TILE; x += 1) {
			const nx = (x + 0.5) / TILE - 0.5;
			const ny = (y + 0.5) / TILE - 0.5;
			const radius = Math.hypot(nx, ny) * 2;
			const angle = Math.atan2(ny, nx);

			// A lobed outline rather than a circle, then eroded by fbm.
			const lobes =
				1 +
				0.22 * Math.sin(angle * 3 + seed * 2.1) +
				0.14 * Math.sin(angle * 5 - seed * 1.3) +
				0.09 * Math.sin(angle * 8 + seed * 3.7);
			const shaped = radius / Math.max(0.35, lobes * 0.92);
			const grain = fbm(nx * 6.5 + seed * 17, ny * 6.5 - seed * 11, seed);
			const fine = fbm(nx * 21 - seed * 5, ny * 21 + seed * 9, seed + 4.4);

			const falloff = 1 - smoothstep(0.05, 0.98, shaped);
			// Erode: the noise eats the edge, so the mark tears instead of fading.
			const eroded = falloff * (0.45 + 1.05 * grain) - 0.24 * (1 - falloff) * fine;
			const body = clamp01(smoothstep(0.06, 0.62, eroded)) * (0.72 + 0.42 * grain);
			const core = clamp01(smoothstep(0.42, 0.95, eroded));

			const px = tileX * TILE + x;
			const py = tileY * TILE + y;
			const index = (py * ATLAS + px) * 4;
			data[index] = 255;
			data[index + 1] = Math.round(clamp01(core) * 255);
			data[index + 2] = Math.round(clamp01(0.25 + 0.75 * fine) * 255);
			data[index + 3] = Math.round(clamp01(body) * 255);
		}
	}
}

/** Bakes the 2x2 atlas of torn marks. Called once per stage. */
export function createParcelStamp(): THREE.DataTexture {
	const data = new Uint8Array(ATLAS * ATLAS * 4);
	let seed = 1.7;
	for (let ty = 0; ty < 2; ty += 1) {
		for (let tx = 0; tx < 2; tx += 1) {
			paintTile(data, tx, ty, seed);
			seed += 5.31;
		}
	}
	const texture = new THREE.DataTexture(data, ATLAS, ATLAS, THREE.RGBAFormat);
	texture.magFilter = THREE.LinearFilter;
	// No mipmaps: a mip chain would blend the four tiles into each other.
	texture.minFilter = THREE.LinearFilter;
	texture.generateMipmaps = false;
	texture.needsUpdate = true;
	return texture;
}
