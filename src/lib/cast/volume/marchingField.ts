/**
 * @file The skin's scalar field and the box of it a paint has touched.
 *
 * A cast fills a small corner of the grid, so every pass over the field (the
 * wipe, the smoothing, the polygonizer) walks only the cells deposits reached
 * rather than all `res³` of them. Cells outside the box are exactly zero, so
 * the bounded passes write the same floats a whole-grid pass would.
 *
 * The ball kernel is three's `MarchingCubes.addBall` without the colour
 * palette it computes even when colours are off, summed in the same order, so
 * the field is bit-identical to the one that class builds.
 *
 * @example
 * const field = new MarchingField(56);
 * field.wipe();
 * field.addBall(0.5, 0.5, 0.2, 0.02, 12);
 * field.smooth(0.5);
 */

import { depositSheet } from './sheetDeposit.js';

/** Inclusive cell bounds on each axis. Empty while `x0 > x1`. */
export interface CellBox {
	x0: number;
	x1: number;
	y0: number;
	y1: number;
	z0: number;
	z1: number;
}

export function emptyBox(): CellBox {
	return { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
}

export class MarchingField {
	readonly res: number;
	readonly values: Float32Array;
	/** Every cell a deposit or a smoothing pass may have made nonzero since the last wipe. */
	readonly box: CellBox = emptyBox();
	readonly #copy: Float32Array;

	constructor(res: number) {
		this.res = res;
		this.values = new Float32Array(res ** 3);
		this.#copy = new Float32Array(res ** 3);
	}

	get empty(): boolean {
		const box = this.box;
		return box.x0 > box.x1 || box.y0 > box.y1 || box.z0 > box.z1;
	}

	/** Zeroes what the last paint touched, which is all of the field that is not already zero. */
	wipe(): void {
		const { box, res, values } = this;
		if (!this.empty) {
			const res2 = res * res;
			for (let z = box.z0; z <= box.z1; z += 1) {
				for (let y = box.y0; y <= box.y1; y += 1) {
					const row = z * res2 + y * res;
					values.fill(0, row + box.x0, row + box.x1 + 1);
				}
			}
		}
		Object.assign(box, emptyBox());
	}

	/**
	 * A reciprocal metaball centred at grid-normalized `(bx, by, bz)` that falls
	 * to zero at `res * sqrt(strength / subtract)` cells. Like three's, it never
	 * writes the outer layer, where the polygonizer's normals are undefined.
	 */
	addBall(bx: number, by: number, bz: number, strength: number, subtract: number): void {
		const res = this.res;
		const radius = res * Math.sqrt(strength / subtract);
		const zs = bz * res;
		const ys = by * res;
		const xs = bx * res;
		const minZ = Math.max(1, Math.floor(zs - radius));
		const maxZ = Math.min(res - 1, Math.floor(zs + radius));
		const minY = Math.max(1, Math.floor(ys - radius));
		const maxY = Math.min(res - 1, Math.floor(ys + radius));
		const minX = Math.max(1, Math.floor(xs - radius));
		const maxX = Math.min(res - 1, Math.floor(xs + radius));
		if (minX >= maxX || minY >= maxY || minZ >= maxZ) return;
		this.#grow(minX, maxX - 1, minY, maxY - 1, minZ, maxZ - 1);
		const values = this.values;
		const res2 = res * res;
		// Where a cell can still be positive, in squared grid-normalized units.
		// Widened by far more than rounding can move it, so trimming a row to
		// its chord never drops a cell the kernel below would write.
		const reach2 = (strength / subtract) * (1 + 1e-9);
		for (let z = minZ; z < maxZ; z += 1) {
			const zOffset = res2 * z;
			const fz = z / res - bz;
			const fz2 = fz * fz;
			for (let y = minY; y < maxY; y += 1) {
				const yOffset = zOffset + res * y;
				const fy = y / res - by;
				const fy2 = fy * fy;
				const left = reach2 - fy2 - fz2;
				if (left <= 0) continue;
				// The row's chord through the ball.
				const half = Math.sqrt(left) * res;
				const fromX = Math.max(minX, Math.ceil(xs - half));
				const toX = Math.min(maxX, Math.floor(xs + half) + 1);
				for (let x = fromX; x < toX; x += 1) {
					const fx = x / res - bx;
					const val = strength / (0.000001 + fx * fx + fy2 + fz2) - subtract;
					if (val > 0) values[yOffset + x] += val;
				}
			}
		}
	}

	/** The weave's flattened ball (`sheetDeposit.ts`), with its reach added to the box. */
	addSheet(
		bx: number,
		by: number,
		bz: number,
		nx: number,
		ny: number,
		nz: number,
		strength: number,
		subtract: number
	): void {
		const res = this.res;
		const radius = res * Math.sqrt(strength / subtract);
		this.#grow(
			Math.floor(bx * res - radius),
			Math.ceil(bx * res + radius),
			Math.floor(by * res - radius),
			Math.ceil(by * res + radius),
			Math.floor(bz * res - radius),
			Math.ceil(bz * res + radius)
		);
		depositSheet(this.values, res, bx, by, bz, nx, ny, nz, strength, subtract);
	}

	/**
	 * Face-neighbour diffusion, which bridges blobs a cell apart into one
	 * surface. One pass spreads matter one cell, so the box grows by one.
	 */
	smooth(intensity: number): void {
		if (this.empty) return;
		const { res, values } = this;
		const res2 = res * res;
		const copy = this.#copy;
		const box = this.box;
		this.#grow(box.x0 - 1, box.x1 + 1, box.y0 - 1, box.y1 + 1, box.z0 - 1, box.z1 + 1);
		// The copy has to hold the zeros one cell past the box too, because a
		// border cell reads them as its neighbours.
		const cx0 = Math.max(0, box.x0 - 1);
		const cx1 = Math.min(res - 1, box.x1 + 1);
		for (let z = Math.max(0, box.z0 - 1); z <= Math.min(res - 1, box.z1 + 1); z += 1) {
			for (let y = Math.max(0, box.y0 - 1); y <= Math.min(res - 1, box.y1 + 1); y += 1) {
				const row = z * res2 + y * res;
				copy.set(values.subarray(row + cx0, row + cx1 + 1), row + cx0);
			}
		}
		for (let z = box.z0; z <= box.z1; z += 1) {
			for (let y = box.y0; y <= box.y1; y += 1) {
				let i = res2 * z + res * y + box.x0;
				for (let x = box.x0; x <= box.x1; x += 1, i += 1) {
					const nb =
						copy[i - 1] +
						copy[i + 1] +
						copy[i - res] +
						copy[i + res] +
						copy[i - res2] +
						copy[i + res2];
					values[i] = copy[i] + intensity * (nb / 6 - copy[i]);
				}
			}
		}
	}

	/** Widens the box to cover these cells, clamped to the interior every writer keeps to. */
	#grow(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): void {
		const box = this.box;
		const hi = this.res - 2;
		box.x0 = Math.max(1, Math.min(box.x0, x0));
		box.x1 = Math.min(hi, Math.max(box.x1, x1));
		box.y0 = Math.max(1, Math.min(box.y0, y0));
		box.y1 = Math.min(hi, Math.max(box.y1, y1));
		box.z0 = Math.max(1, Math.min(box.z0, z0));
		box.z1 = Math.min(hi, Math.max(box.z1, z1));
	}
}
