/**
 * @file The volume skin: one marching-cubes metaball surface wrapped around
 * every channel's tracer cloud, so a cast is ONE merged rounded body per
 * element rather than countable particles. Same medium merges — a jet and the
 * burst it stands in are the same stuff, so their deposits share this field.
 *
 * The per-element field shaping (`elements.ts` SKIN) is what makes water one
 * rounded mass and crystal deliberate facets: it shapes the FIELD, not the
 * color, down to the grid it is polygonized on. Purely cosmetic — the tracers
 * move unchanged; this only watches them.
 *
 * The chip law lives here: deposits below the binary cutoff are not made at
 * all, cohesion melts loners toward the crowd, and the height-melt upstream in
 * `tracers.ts` fades crowns before they can freeze into grid-sized chips.
 *
 * Every pass over the field is bounded by the box the deposits reached
 * (`marchingField.ts`), and only the vertices a paint wrote go to the GPU.
 */

import * as THREE from 'three';
import { SPAN, TRACER_BUDGET, VOLUME, Z0 } from './tuning.js';
import { Cohesion } from './cohesion.js';
import { MarchingField, smoothingPasses } from './marchingField.js';
import { Polygonizer } from './polygonize.js';
import { FINEST_GRID, type SkinSpec } from './elements.js';
import type { VolumeSubstrate } from './substrate.js';

/** Triangles one paint may emit. The busiest lab cast measured stays under a third of it. */
const MAX_TRIANGLES = 120000;
const surfaceNormal = { x: 0, y: 0, z: 0 };

export class VolumeSkin {
	readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
	/** One field per grid a row has asked for, kept so a recast allocates nothing. */
	readonly #fields = new Map<number, MarchingField>();
	readonly #polygonizer = new Polygonizer(FINEST_GRID, MAX_TRIANGLES);
	readonly #position: THREE.BufferAttribute;
	readonly #normal: THREE.BufferAttribute;
	readonly #candPos = new Float32Array(TRACER_BUDGET * 3);
	readonly #candWeight = new Float32Array(TRACER_BUDGET);
	readonly #candVel = new Float32Array(TRACER_BUDGET * 3);
	readonly #candNormal = new Float32Array(TRACER_BUDGET * 3);
	readonly #cohesion = new Cohesion(TRACER_BUDGET, VOLUME.cohesionR / SPAN);
	#spec: SkinSpec | null = null;
	/** The attached row's field. */
	#field = this.#fieldFor(FINEST_GRID);

	constructor(material: THREE.Material) {
		const geometry = new THREE.BufferGeometry();
		this.#position = new THREE.BufferAttribute(this.#polygonizer.positions, 3);
		this.#normal = new THREE.BufferAttribute(this.#polygonizer.normals, 3);
		this.#position.setUsage(THREE.DynamicDrawUsage);
		this.#normal.setUsage(THREE.DynamicDrawUsage);
		geometry.setAttribute('position', this.#position);
		geometry.setAttribute('normal', this.#normal);
		geometry.setDrawRange(0, 0);
		// The renderer sorts transparent meshes by this sphere's centre. Fixed at
		// the grid's centre, so a paint's vertices never reorder the draw.
		geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
		this.mesh = new THREE.Mesh(geometry, material);
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

	/** Points the skin at one cast's element row, on that row's grid. */
	attach(spec: SkinSpec): void {
		this.#spec = spec;
		this.#field = this.#fieldFor(spec.grid);
	}

	detach(): void {
		this.#spec = null;
		this.#field.wipe();
		this.mesh.geometry.setDrawRange(0, 0);
	}

	dispose(): void {
		this.mesh.geometry.dispose();
	}

	#fieldFor(grid: number): MarchingField {
		let field = this.#fields.get(grid);
		if (!field) {
			field = new MarchingField(grid);
			this.#fields.set(grid, field);
		}
		return field;
	}

	/** Re-deposit every visible tracer as a smeared metaball and re-polygonize. */
	update(substrate: VolumeSubstrate): void {
		const spec = this.#spec;
		if (!spec) {
			return;
		}
		this.#field.wipe();
		const coh = VOLUME.cohesion * spec.cohesion;
		const smear = (VOLUME.smear * 1.5 * spec.smearScale) / SPAN;
		let balls = 0;
		this.#candNormal.fill(0);
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
				// Matter dims out before the grid's x/y walls, so the surface can
				// never be clipped into a straight glass edge there. The cutoff
				// downstream turns the faded tail into no deposit at all.
				const wall = Math.min(bx, 1 - bx, by, 1 - by);
				const wallFade = wall >= VOLUME.wallMargin ? 1 : wall / VOLUME.wallMargin;
				const w = (0.16 + 0.84 * fade[i]) * weight * wallFade;
				this.#candPos[balls * 3] = bx;
				this.#candPos[balls * 3 + 1] = by;
				this.#candPos[balls * 3 + 2] = bz;
				this.#candVel[balls * 3] = vel[i * 3] * smear;
				this.#candVel[balls * 3 + 1] = vel[i * 3 + 1] * smear;
				this.#candVel[balls * 3 + 2] = vel[i * 3 + 2] * smear;
				this.#candWeight[balls] = w;
				if (channel.flow.ribbon) {
					channel.tracers.surfaceNormal(i, channel.flow.ribbon, surfaceNormal);
					this.#candNormal[balls * 3] = -surfaceNormal.x;
					this.#candNormal[balls * 3 + 1] = surfaceNormal.y;
					this.#candNormal[balls * 3 + 2] = surfaceNormal.z;
				}
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
		const smoothing = smoothingPasses((spec.smoothing * spec.grid) / SPAN);
		for (let k = 0; k < smoothing.passes; k += 1) this.#field.smooth(smoothing.intensity);
		this.#upload(this.#polygonizer.run(this.#field, VOLUME.isolation * spec.isoScale));
	}

	/**
	 * Sends the vertices this paint wrote and nothing past them. The buffers
	 * are sized for the worst case, and a full upload of them every paint cost
	 * more bandwidth than everything the skin draws.
	 */
	#upload(vertices: number): void {
		this.mesh.geometry.setDrawRange(0, vertices);
		// An update range of zero length means the whole buffer to WebGL, and an
		// empty paint draws nothing anyway.
		if (vertices === 0) return;
		for (const attribute of [this.#position, this.#normal]) {
			attribute.clearUpdateRanges();
			attribute.addUpdateRange(0, vertices * 3);
			attribute.needsUpdate = true;
		}
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
		const normal = this.#candNormal;
		if (Math.hypot(normal[j * 3], normal[j * 3 + 1], normal[j * 3 + 2]) > 0.5) {
			this.#field.addSheet(
				mx,
				by,
				bz,
				normal[j * 3],
				normal[j * 3 + 1],
				normal[j * 3 + 2],
				s * 2,
				VOLUME.subtract
			);
			return;
		}
		this.#field.addBall(mx, by, bz, s, VOLUME.subtract);
		this.#field.addBall(mx + sx, by - sy, bz - sz, s, VOLUME.subtract);
	}

	/**
	 * Cohesion: contract each deposit toward the centroid of its neighbours and
	 * let strength grow with company, so gaps close into one surface while
	 * stragglers thin to the loner floor and melt instead of chipping.
	 */
	#cohereAndDeposit(count: number, coh: number, spec: SkinSpec): void {
		const cand = this.#candPos;
		const { company, sum } = this.#cohesion;
		this.#cohesion.gather(cand, count);
		for (let j = 0; j < count; j += 1) {
			const x = cand[j * 3];
			const y = cand[j * 3 + 1];
			const z = cand[j * 3 + 2];
			const k = company[j];
			const t = Math.min(1, (k - 1) / Math.max(1, VOLUME.cohesionK - 1));
			const w = spec.loner + (1 - spec.loner) * t;
			const pull = coh * t;
			this.#deposit(
				j,
				x + (sum[j * 3] / k - x) * pull,
				y + (sum[j * 3 + 1] / k - y) * pull,
				z + (sum[j * 3 + 2] / k - z) * pull,
				w,
				spec
			);
		}
	}
}
