/**
 * @file Marching cubes over the box of the field a paint touched.
 *
 * This is three's `MarchingCubes` polygonizer, kept to the same arithmetic in
 * the same cell order, so the triangles come out identical and in the same
 * sequence (the ink skin blends without sorting, so order is part of the
 * picture). It differs in what it skips: cells outside the field's box are all
 * zero and cannot cross the isolation, there is no colour or uv channel, and
 * a gradient normal is computed once per paint instead of once per sentinel
 * miss.
 *
 * Positions come out in the mesh's local cube, `[-1, 1)` on each axis.
 *
 * @example
 * const polygonizer = new Polygonizer(field.res, 120000);
 * const vertices = polygonizer.run(field, 60);
 * geometry.setDrawRange(0, vertices);
 */

import { edgeTable, triTable } from 'three/examples/jsm/objects/MarchingCubes.js';
import type { MarchingField } from './marchingField.js';

const X = 0;
const Y = 1;
const Z = 2;
type Axis = typeof X | typeof Y | typeof Z;

export class Polygonizer {
	readonly positions: Float32Array;
	readonly normals: Float32Array;
	readonly #res: number;
	readonly #normalCache: Float32Array;
	/** Which paint last filled each cell's normal, so the cache needs no wipe. */
	readonly #normalPaint: Uint32Array;
	readonly #vlist = new Float32Array(36);
	readonly #nlist = new Float32Array(36);
	#paint = 0;

	constructor(res: number, maxTriangles: number) {
		this.#res = res;
		this.positions = new Float32Array(maxTriangles * 9);
		this.normals = new Float32Array(maxTriangles * 9);
		this.#normalCache = new Float32Array(res ** 3 * 3);
		this.#normalPaint = new Uint32Array(res ** 3);
	}

	/** Polygonizes the field at `isolation` and returns how many vertices it wrote. */
	run(field: MarchingField, isolation: number): number {
		this.#paint += 1;
		if (field.empty) return 0;
		const res = this.#res;
		const res2 = res * res;
		const half = res / 2;
		const values = field.values;
		const { box } = field;
		// A cube reads its corner one cell past its own index, so the cubes that
		// can see the box start one cell before it. Three's loop keeps two
		// cells clear of the far wall, so this one does too.
		const x0 = Math.max(1, box.x0 - 1);
		const y0 = Math.max(1, box.y0 - 1);
		const z0 = Math.max(1, box.z0 - 1);
		const x1 = Math.min(res - 3, box.x1);
		const y1 = Math.min(res - 3, box.y1);
		const z1 = Math.min(res - 3, box.z1);
		let count = 0;
		for (let z = z0; z <= z1; z += 1) {
			const zOffset = res2 * z;
			const fz = (z - half) / half;
			for (let y = y0; y <= y1; y += 1) {
				const yOffset = zOffset + res * y;
				const fy = (y - half) / half;
				for (let x = x0; x <= x1; x += 1) {
					const fx = (x - half) / half;
					count = this.#cube(values, fx, fy, fz, yOffset + x, isolation, count);
				}
			}
		}
		return count;
	}

	#cube(
		field: Float32Array,
		fx: number,
		fy: number,
		fz: number,
		q: number,
		isol: number,
		count: number
	): number {
		const res = this.#res;
		const res2 = res * res;
		const q1 = q + 1;
		const qy = q + res;
		const qz = q + res2;
		const q1y = q1 + res;
		const q1z = q1 + res2;
		const qyz = q + res + res2;
		const q1yz = q1 + res + res2;
		const field0 = field[q];
		const field1 = field[q1];
		const field2 = field[qy];
		const field3 = field[q1y];
		const field4 = field[qz];
		const field5 = field[q1z];
		const field6 = field[qyz];
		const field7 = field[q1yz];
		let cubeindex = 0;
		if (field0 < isol) cubeindex |= 1;
		if (field1 < isol) cubeindex |= 2;
		if (field2 < isol) cubeindex |= 8;
		if (field3 < isol) cubeindex |= 4;
		if (field4 < isol) cubeindex |= 16;
		if (field5 < isol) cubeindex |= 32;
		if (field6 < isol) cubeindex |= 128;
		if (field7 < isol) cubeindex |= 64;
		const bits = edgeTable[cubeindex];
		if (bits === 0) return count;

		const d = 2 / res;
		const fx2 = fx + d;
		const fy2 = fy + d;
		const fz2 = fz + d;
		// Top of the cube, bottom of the cube, then its four vertical edges.
		if (bits & 1) this.#edge(field, 0, X, q, q1, fx, fy, fz, field0, field1, isol);
		if (bits & 2) this.#edge(field, 3, Y, q1, q1y, fx2, fy, fz, field1, field3, isol);
		if (bits & 4) this.#edge(field, 6, X, qy, q1y, fx, fy2, fz, field2, field3, isol);
		if (bits & 8) this.#edge(field, 9, Y, q, qy, fx, fy, fz, field0, field2, isol);
		if (bits & 16) this.#edge(field, 12, X, qz, q1z, fx, fy, fz2, field4, field5, isol);
		if (bits & 32) this.#edge(field, 15, Y, q1z, q1yz, fx2, fy, fz2, field5, field7, isol);
		if (bits & 64) this.#edge(field, 18, X, qyz, q1yz, fx, fy2, fz2, field6, field7, isol);
		if (bits & 128) this.#edge(field, 21, Y, qz, qyz, fx, fy, fz2, field4, field6, isol);
		if (bits & 256) this.#edge(field, 24, Z, q, qz, fx, fy, fz, field0, field4, isol);
		if (bits & 512) this.#edge(field, 27, Z, q1, q1z, fx2, fy, fz, field1, field5, isol);
		if (bits & 1024) this.#edge(field, 30, Z, q1y, q1yz, fx2, fy2, fz, field3, field7, isol);
		if (bits & 2048) this.#edge(field, 33, Z, qy, qyz, fx, fy2, fz, field2, field6, isol);

		const positions = this.positions;
		const normals = this.normals;
		const vlist = this.#vlist;
		const nlist = this.#nlist;
		const row = cubeindex << 4;
		for (let i = 0; triTable[row + i] !== -1; i += 3) {
			// Full: the rest of this paint is dropped rather than written past the buffer.
			if ((count + 3) * 3 > positions.length) return count;
			const c = count * 3;
			for (let k = 0; k < 3; k += 1) {
				const o = 3 * triTable[row + i + k];
				positions[c + k * 3] = vlist[o];
				positions[c + k * 3 + 1] = vlist[o + 1];
				positions[c + k * 3 + 2] = vlist[o + 2];
				normals[c + k * 3] = nlist[o];
				normals[c + k * 3 + 1] = nlist[o + 1];
				normals[c + k * 3 + 2] = nlist[o + 2];
			}
			count += 3;
		}
		return count;
	}

	/**
	 * One crossing on the edge from corner cell `a` to its neighbour `b` along
	 * `axis`: the vertex slides from `a` toward `b` by the fraction `mu` of a
	 * cell, and its normal blends the two corners' gradients by the same `mu`.
	 */
	#edge(
		field: Float32Array,
		offset: number,
		axis: Axis,
		a: number,
		b: number,
		x: number,
		y: number,
		z: number,
		valueA: number,
		valueB: number,
		isol: number
	): void {
		this.#gradient(field, a);
		this.#gradient(field, b);
		const mu = (isol - valueA) / (valueB - valueA);
		const slide = mu * (2 / this.#res);
		const vlist = this.#vlist;
		vlist[offset] = axis === X ? x + slide : x;
		vlist[offset + 1] = axis === Y ? y + slide : y;
		vlist[offset + 2] = axis === Z ? z + slide : z;
		const nc = this.#normalCache;
		const na = a * 3;
		const nb = b * 3;
		const nlist = this.#nlist;
		nlist[offset] = nc[na] + (nc[nb] - nc[na]) * mu;
		nlist[offset + 1] = nc[na + 1] + (nc[nb + 1] - nc[na + 1]) * mu;
		nlist[offset + 2] = nc[na + 2] + (nc[nb + 2] - nc[na + 2]) * mu;
	}

	/** The field's central-difference gradient at one cell, cached for this paint. */
	#gradient(field: Float32Array, q: number): void {
		if (this.#normalPaint[q] === this.#paint) return;
		this.#normalPaint[q] = this.#paint;
		const res = this.#res;
		const res2 = res * res;
		const nc = this.#normalCache;
		const q3 = q * 3;
		nc[q3] = field[q - 1] - field[q + 1];
		nc[q3 + 1] = field[q - res] - field[q + res];
		nc[q3 + 2] = field[q - res2] - field[q + res2];
	}
}
