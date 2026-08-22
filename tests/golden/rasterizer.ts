/**
 * @file Software rasterizer for the cast tier, adapted from the `theorycrafting`
 * branch's three-panel renderer down to what a diff needs.
 *
 * Two small panels per frame, both in seal space: a top view (x right, y
 * screen-down) and a side view (x right, z up). Parcels splat additively in
 * white over a dim reference ring, so a moved population is obvious at a glance
 * and a whole preset's baselines fit on one screen.
 */

import { encodePng } from './png.js';

/** All a frame needs of a parcel: where it sits in seal space. */
export interface RasterPoint {
	x: number;
	y: number;
	z: number;
}

const PANEL = 96;
const GAP = 4;
const WIDTH = PANEL * 2 + GAP * 3;
const HEIGHT = PANEL + GAP * 2;

// Seal units across a panel. 3.2 covers the ring (radius 1) plus the spawn
// domains that sit outside it, without shrinking the seal to a dot.
const SPAN = 3.2;
// The side panel starts just below the paper so grounded parcels stay visible.
const SIDE_Z_MIN = -0.15;

const RING_INK: Rgb = [0.1, 0.17, 0.24];
const PARCEL_INK: Rgb = [0.85, 0.85, 0.85];
// Additive brightness rolls off, so a dense clump reads as bright rather than
// as an all-white blob that hides its shape.
const TONE_GAMMA = 1.6;

type Rgb = [number, number, number];

class Framebuffer {
	readonly #accumulator = new Float32Array(WIDTH * HEIGHT * 3);

	splat(px: number, py: number, ink: Rgb, intensity: number): void {
		const x = Math.round(px);
		const y = Math.round(py);
		if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) {
			return;
		}
		const offset = (y * WIDTH + x) * 3;
		this.#accumulator[offset] += ink[0] * intensity;
		this.#accumulator[offset + 1] += ink[1] * intensity;
		this.#accumulator[offset + 2] += ink[2] * intensity;
	}

	toRgb(): Uint8Array {
		const rgb = new Uint8Array(WIDTH * HEIGHT * 3);
		for (let i = 0; i < rgb.length; i += 1) {
			const tone = Math.pow(1 - Math.exp(-this.#accumulator[i]), 1 / TONE_GAMMA);
			rgb[i] = Math.min(255, Math.round(255 * tone));
		}
		return rgb;
	}
}

const topX = (x: number) => GAP + ((x + SPAN / 2) / SPAN) * PANEL;
const topY = (y: number) => GAP + ((y + SPAN / 2) / SPAN) * PANEL;
const sideX = (x: number) => GAP * 2 + PANEL + ((x + SPAN / 2) / SPAN) * PANEL;
const sideY = (z: number) => GAP + ((SPAN + SIDE_Z_MIN - z) / SPAN) * PANEL;

/** The unit ring in the top panel, and the paper it stands on in the side panel. */
function drawSealReference(frame: Framebuffer): void {
	const segments = 360;
	for (let i = 0; i < segments; i += 1) {
		const angle = (i / segments) * Math.PI * 2;
		frame.splat(topX(Math.cos(angle)), topY(Math.sin(angle)), RING_INK, 1);
	}
	for (let i = 0; i <= PANEL; i += 1) {
		const x = -SPAN / 2 + (i / PANEL) * SPAN;
		frame.splat(sideX(x), sideY(0), RING_INK, Math.abs(x) <= 1 ? 1 : 0.45);
	}
}

/**
 * One frame of a population as a PNG: top view left, side view right.
 *
 * @example
 * writeFileSync(path, rasterizePopulation(sealPoints(state.parcels)));
 */
export function rasterizePopulation(parcels: RasterPoint[]): Buffer {
	const frame = new Framebuffer();
	drawSealReference(frame);
	for (const parcel of parcels) {
		frame.splat(topX(parcel.x), topY(parcel.y), PARCEL_INK, 1);
		frame.splat(sideX(parcel.x), sideY(parcel.z), PARCEL_INK, 1);
	}
	return encodePng(WIDTH, HEIGHT, frame.toRgb());
}
