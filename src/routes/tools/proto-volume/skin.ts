/**
 * @file The volume skin: a marching-cubes metaball surface wrapped around the
 * tracer cloud, ported from PR #74's elementVolume.ts onto the seal root. The
 * per-element field shaping (elements.ts SKIN) is what makes water one merged
 * rounded body and wind a barely-there streak: it shapes the FIELD, not the
 * color. Purely cosmetic — the tracers move unchanged; this only watches them.
 */

import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { SKIN, type ProtoElement } from './elements.js';
import { TRACER_MAX, type Tracers } from './tracers.js';

/** Grid footprint in seal units: x,y in [-2.2, 2.2], z in [-0.1, 4.3]. */
export const SPAN = 4.4;
const Z0 = -0.1;

/** PR #74's tunables, ported as starting points (their config.ts VOLUME_*). */
const VOLUME = {
	res: 64,
	strength: 0.028,
	subtract: 12,
	isolation: 60,
	smear: 0.12,
	maxBalls: 2200,
	cohesion: 0.65,
	cohesionR: 0.26,
	cohesionK: 8
} as const;

const GRID_MAX = 40;

export class VolumeSkin {
	readonly mesh: MarchingCubes;
	readonly #look = {
		isoScale: 1,
		smearScale: 1,
		smooth: 0,
		smoothPasses: 0,
		cohesion: 0,
		strengthScale: 1,
		loner: 0.45
	};
	readonly #fieldCopy = new Float32Array(VOLUME.res ** 3);
	readonly #candPos = new Float32Array(TRACER_MAX * 3);
	readonly #candIdx = new Int32Array(TRACER_MAX);
	readonly #gridHead = new Int32Array(GRID_MAX ** 3);
	readonly #gridNext = new Int32Array(TRACER_MAX);

	constructor(element: ProtoElement, material: THREE.Material) {
		Object.assign(this.#look, SKIN[element]);
		this.mesh = new MarchingCubes(VOLUME.res, material, false, false, 100000);
		// The seal root's axis swap has determinant -1, which would flip the
		// polygonized winding and invert the lighting. Mirroring the mesh on x
		// (and depositing mirrored to compensate) restores a +1 determinant, so
		// front faces stay front faces and normals light correctly.
		this.mesh.scale.set(-SPAN / 2, SPAN / 2, SPAN / 2);
		// Seal coords: centered in the plane, the grid's low z edge under the paper.
		this.mesh.position.set(0, 0, Z0 + SPAN / 2);
		this.mesh.frustumCulled = false;
		this.mesh.name = 'volume-skin';
	}

	dispose(): void {
		this.mesh.geometry.dispose();
	}

	/** Re-deposit every alive tracer as a smeared metaball and re-polygonize. */
	update(tracers: Tracers): void {
		const m = this.mesh;
		const look = this.#look;
		m.isolation = VOLUME.isolation * look.isoScale;
		m.reset();
		const coh = VOLUME.cohesion * look.cohesion;
		const smear = (VOLUME.smear * 1.5 * look.smearScale) / SPAN;
		let balls = 0;
		for (let i = 0; i < TRACER_MAX && balls < VOLUME.maxBalls; i += 1) {
			if (!tracers.alive[i]) continue;
			// A deposit this faint can only ever render as a stray grid chip.
			if (tracers.fade[i] < 0.08) continue;
			const bx = (tracers.pos[i * 3] + SPAN / 2) / SPAN;
			const by = (tracers.pos[i * 3 + 1] + SPAN / 2) / SPAN;
			const bz = (tracers.pos[i * 3 + 2] - Z0) / SPAN;
			if (bx < 0 || bx > 1 || by < 0 || by > 1 || bz < 0 || bz > 1) continue;
			if (coh > 0) {
				this.#candPos[balls * 3] = bx;
				this.#candPos[balls * 3 + 1] = by;
				this.#candPos[balls * 3 + 2] = bz;
				this.#candIdx[balls] = i;
			} else {
				this.#deposit(tracers, i, bx, by, bz, 1, smear);
			}
			balls += 1;
		}
		if (coh > 0) this.#cohereAndDeposit(tracers, balls, coh, smear);
		for (let k = 0; k < look.smoothPasses; k += 1) this.#smoothField(look.smooth);
		m.update();
	}

	/** Deposit a smeared metaball pair: fast tracers become bead strands. */
	#deposit(
		tracers: Tracers,
		i: number,
		bx: number,
		by: number,
		bz: number,
		w: number,
		smear: number
	): void {
		// A metaball smaller than a couple of grid cells polygonizes as a chip,
		// so a deposit is either big enough to render round or not made at all.
		const tw = (0.16 + 0.84 * tracers.fade[i]) * w;
		if (tw < 0.42) {
			return;
		}
		const s = VOLUME.strength * 0.6 * this.#look.strengthScale * tw;
		const sx = tracers.vel[i * 3] * smear;
		const sy = tracers.vel[i * 3 + 1] * smear;
		const sz = tracers.vel[i * 3 + 2] * smear;
		// Mirrored x, undoing the mesh's negative x scale (see constructor).
		const mx = 1 - bx;
		this.mesh.addBall(mx, by, bz, s, VOLUME.subtract);
		this.mesh.addBall(mx + sx, by - sy, bz - sz, s, VOLUME.subtract);
	}

	/**
	 * Cohesion: contract each deposit toward the centroid of its neighbours;
	 * stragglers thin out and pinch off as droplets. Deposit-side only.
	 */
	#cohereAndDeposit(tracers: Tracers, count: number, coh: number, smear: number): void {
		const rN = VOLUME.cohesionR / SPAN;
		const gn = Math.min(GRID_MAX, Math.max(1, Math.floor(1 / rN)));
		const cand = this.#candPos;
		const head = this.#gridHead.fill(-1, 0, gn * gn * gn);
		const next = this.#gridNext;
		for (let j = 0; j < count; j += 1) {
			const cx = Math.min(gn - 1, (cand[j * 3] * gn) | 0);
			const cy = Math.min(gn - 1, (cand[j * 3 + 1] * gn) | 0);
			const cz = Math.min(gn - 1, (cand[j * 3 + 2] * gn) | 0);
			const c = (cz * gn + cy) * gn + cx;
			next[j] = head[c];
			head[c] = j;
		}
		const r2 = rN * rN;
		for (let j = 0; j < count; j += 1) {
			const x = cand[j * 3];
			const y = cand[j * 3 + 1];
			const z = cand[j * 3 + 2];
			const cx = Math.min(gn - 1, (x * gn) | 0);
			const cy = Math.min(gn - 1, (y * gn) | 0);
			const cz = Math.min(gn - 1, (z * gn) | 0);
			let k = 0;
			let mx = 0;
			let my = 0;
			let mz = 0;
			for (let dz = -1; dz <= 1; dz += 1) {
				const zc = cz + dz;
				if (zc < 0 || zc >= gn) continue;
				for (let dy = -1; dy <= 1; dy += 1) {
					const yc = cy + dy;
					if (yc < 0 || yc >= gn) continue;
					for (let dx = -1; dx <= 1; dx += 1) {
						const xc = cx + dx;
						if (xc < 0 || xc >= gn) continue;
						for (let o = head[(zc * gn + yc) * gn + xc]; o !== -1; o = next[o]) {
							const ex = cand[o * 3] - x;
							const ey = cand[o * 3 + 1] - y;
							const ez = cand[o * 3 + 2] - z;
							if (ex * ex + ey * ey + ez * ez > r2) continue;
							k += 1;
							mx += cand[o * 3];
							my += cand[o * 3 + 1];
							mz += cand[o * 3 + 2];
						}
					}
				}
			}
			const t = Math.min(1, (k - 1) / Math.max(1, VOLUME.cohesionK - 1));
			const loner = this.#look.loner;
			const w = loner + (1 - loner) * t;
			const pull = coh * t;
			this.#deposit(
				tracers,
				this.#candIdx[j],
				x + (mx / k - x) * pull,
				y + (my / k - y) * pull,
				z + (mz / k - z) * pull,
				w,
				smear
			);
		}
	}

	/** Face-neighbour diffusion: bridges blobs a cell apart into one surface. */
	#smoothField(intensity: number): void {
		const f = this.mesh.field as Float32Array;
		const n = VOLUME.res;
		const n2 = n * n;
		const c = this.#fieldCopy;
		c.set(f);
		for (let z = 1; z < n - 1; z += 1) {
			for (let y = 1; y < n - 1; y += 1) {
				let i = n2 * z + n * y + 1;
				for (let x = 1; x < n - 1; x += 1, i += 1) {
					const nb = c[i - 1] + c[i + 1] + c[i - n] + c[i + n] + c[i - n2] + c[i + n2];
					f[i] = c[i] + intensity * (nb / 6 - c[i]);
				}
			}
		}
	}
}
