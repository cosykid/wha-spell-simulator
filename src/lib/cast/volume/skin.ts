/**
 * @file The volume skin: one marching-cubes metaball surface wrapped around
 * every channel's tracer cloud, so a cast is ONE merged rounded body per
 * element rather than countable particles. Same medium merges — a jet and the
 * burst it stands in are the same stuff, so their deposits share this field.
 *
 * The per-element field shaping (`elements.ts` SKIN) is what makes water one
 * rounded mass and crystal deliberate facets: it shapes the FIELD, not the
 * color. Purely cosmetic — the tracers move unchanged; this only watches them.
 *
 * The chip law lives here: deposits below the binary cutoff are not made at
 * all, cohesion melts loners toward the crowd, and the height-melt upstream in
 * `tracers.ts` fades crowns before they can freeze into grid-sized chips.
 */

import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { SPAN, TRACER_BUDGET, VOLUME, Z0 } from './tuning.js';
import type { SkinSpec } from './elements.js';
import type { VolumeSubstrate } from './substrate.js';

const GRID_MAX = 40;

export class VolumeSkin {
	readonly mesh: MarchingCubes;
	readonly #fieldCopy = new Float32Array(VOLUME.res ** 3);
	readonly #candPos = new Float32Array(TRACER_BUDGET * 3);
	readonly #candWeight = new Float32Array(TRACER_BUDGET);
	readonly #candVel = new Float32Array(TRACER_BUDGET * 3);
	readonly #gridHead = new Int32Array(GRID_MAX ** 3);
	readonly #gridNext = new Int32Array(TRACER_BUDGET);
	#spec: SkinSpec | null = null;

	constructor(material: THREE.Material) {
		this.mesh = new MarchingCubes(VOLUME.res, material, false, false, 120000);
		// The seal root's axis swap has determinant -1, which would flip the
		// polygonized winding and invert the shading. Mirroring the mesh on x
		// (and depositing mirrored to compensate) restores a +1 determinant, so
		// front faces stay front faces and normals read correctly.
		this.mesh.scale.set(-SPAN / 2, SPAN / 2, SPAN / 2);
		// Seal coords: centered in the plane, the grid's low z edge under the paper.
		this.mesh.position.set(0, 0, Z0 + SPAN / 2);
		this.mesh.frustumCulled = false;
		this.mesh.name = 'volume-skin';
	}

	/** Points the skin at one cast's element row. */
	attach(spec: SkinSpec): void {
		this.#spec = spec;
	}

	detach(): void {
		this.#spec = null;
		this.mesh.reset();
		this.mesh.update();
	}

	dispose(): void {
		this.mesh.geometry.dispose();
	}

	/** Re-deposit every visible tracer as a smeared metaball and re-polygonize. */
	update(substrate: VolumeSubstrate): void {
		const spec = this.#spec;
		const m = this.mesh;
		if (!spec) {
			return;
		}
		m.isolation = VOLUME.isolation * spec.isoScale;
		m.reset();
		const coh = VOLUME.cohesion * spec.cohesion;
		const smear = (VOLUME.smear * 1.5 * spec.smearScale) / SPAN;
		let balls = 0;
		for (const channel of substrate.channels) {
			// The medium is washes on the paper, never part of the body: R-10's
			// world must not merge with the manifestation it surrounds.
			if (channel.kind === 'shimmer') continue;
			const weight = channel.flow.deposit;
			if (weight <= 0) continue;
			const { pos, vel, alive, fade, capacity } = channel.tracers;
			for (let i = 0; i < capacity && balls < VOLUME.maxBalls; i += 1) {
				if (!alive[i]) continue;
				// A deposit this faint can only ever render as a stray grid chip.
				if (fade[i] < VOLUME.fadeFloor) continue;
				const bx = (pos[i * 3] + SPAN / 2) / SPAN;
				const by = (pos[i * 3 + 1] + SPAN / 2) / SPAN;
				const bz = (pos[i * 3 + 2] - Z0) / SPAN;
				if (bx < 0 || bx > 1 || by < 0 || by > 1 || bz < 0 || bz > 1) continue;
				const w = (0.16 + 0.84 * fade[i]) * weight;
				this.#candPos[balls * 3] = bx;
				this.#candPos[balls * 3 + 1] = by;
				this.#candPos[balls * 3 + 2] = bz;
				this.#candVel[balls * 3] = vel[i * 3] * smear;
				this.#candVel[balls * 3 + 1] = vel[i * 3 + 1] * smear;
				this.#candVel[balls * 3 + 2] = vel[i * 3 + 2] * smear;
				this.#candWeight[balls] = w;
				balls += 1;
			}
		}
		if (coh > 0) {
			this.#cohereAndDeposit(balls, coh, spec);
		} else {
			for (let j = 0; j < balls; j += 1) {
				this.#deposit(
					j,
					this.#candPos[j * 3],
					this.#candPos[j * 3 + 1],
					this.#candPos[j * 3 + 2],
					1,
					spec
				);
			}
		}
		for (let k = 0; k < spec.smoothPasses; k += 1) this.#smoothField(spec.smooth);
		m.update();
	}

	/**
	 * Deposit a smeared metaball pair: fast tracers become bead strands that
	 * fuse along the flow. The chip law's cutoff gates the whole pair, so a
	 * deposit is either big enough to render round or not made at all.
	 */
	#deposit(j: number, bx: number, by: number, bz: number, w: number, spec: SkinSpec): void {
		const tw = this.#candWeight[j] * w;
		if (tw < VOLUME.cutoff) {
			return;
		}
		const s = VOLUME.strength * 0.6 * spec.strengthScale * tw;
		const sx = this.#candVel[j * 3];
		const sy = this.#candVel[j * 3 + 1];
		const sz = this.#candVel[j * 3 + 2];
		// Mirrored x, undoing the mesh's negative x scale (see constructor).
		const mx = 1 - bx;
		this.mesh.addBall(mx, by, bz, s, VOLUME.subtract);
		this.mesh.addBall(mx + sx, by - sy, bz - sz, s, VOLUME.subtract);
	}

	/**
	 * Cohesion: contract each deposit toward the centroid of its neighbours and
	 * let strength grow with company, so gaps close into one surface while
	 * stragglers thin to the loner floor and melt instead of chipping.
	 */
	#cohereAndDeposit(count: number, coh: number, spec: SkinSpec): void {
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
			const w = spec.loner + (1 - spec.loner) * t;
			const pull = coh * t;
			this.#deposit(
				j,
				x + (mx / k - x) * pull,
				y + (my / k - y) * pull,
				z + (mz / k - z) * pull,
				w,
				spec
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
