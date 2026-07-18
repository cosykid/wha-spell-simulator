/**
 * Element "volume": a marching-cubes metaball skin wrapped around the tracer
 * cloud, so the manifestation reads as a contiguous body of fire/water/…
 * rather than individual dots. Each alive tracer deposits a metaball into a
 * scalar field; the isosurface is polygonized every frame and shaded with the
 * element's material from volumeLooks. Purely cosmetic — the tracers still
 * follow field.ts unchanged; this only *watches* them.
 */
import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { CONFIG } from '../core/config.js';
import type { SimElement } from '../core/model.js';
import type { Particles3D } from './particles3d.js';
import { depositPlume, depositTwistFunnel } from './poolPlume.js';
import { createVolumeMaterials, LOOKS } from './volumeLooks.js';
import { funnelR, swayX, swayZ } from './whirlSway.js';

/** What the volume reads off the ambient medium (all render-side). */
export interface AmbientSource {
	forEachPooled(
		cb: (x: number, y: number, z: number, vx: number, vy: number, vz: number, heat: number) => void
	): void;
	forEachStreaming?(
		cb: (x: number, y: number, z: number, vx: number, vy: number, vz: number, w: number) => void
	): void;
	/** Vortex crown height; 0 or absent = the pool lies flat. */
	poolHeight?(): number;
	/** Whirl rotation phase the helical deposits wind off. */
	poolPhase?(): number;
	/** Twist-tornado funnel (crown height + core taper); null while none stands. */
	twistFunnel?(): { h: number; r0: number; r1: number } | null;
}

// grid footprint: x,z ∈ [-2.2, 2.2], y ∈ [-0.1, 4.3] (matches the PNG panels)
const SPAN = 4.4;
const Y0 = -0.1;

// cohesion neighbour grid: cell edge ≥ radius so 27 cells cover it (≤ 40/axis)
const GRID_MAX = 40;

// scratch for handing a stream mote's velocity to pushCandidate
const streamVel = new Float32Array(3);

export class ElementVolume3D {
	readonly mesh: MarchingCubes;
	private readonly materials: Record<SimElement, THREE.Material>;
	private readonly uTime = { value: 0 };
	// whirl rotation phase, fed to the fire shader so its spiral bands turn
	// with the physical ropes instead of on their own clock
	private readonly uPhase = { value: 0 };
	private readonly fieldCopy = new Float32Array(CONFIG.VOLUME_RES ** 3);
	// scratch for the cohesion pass (grid-normalized deposit candidates):
	// tracers and stream motes share it, so the inflow fuses with the plume
	private readonly candPos = new Float32Array(CONFIG.MAX_PARTICLES * 3);
	private readonly candVel = new Float32Array(CONFIG.MAX_PARTICLES * 3);
	private readonly candFade = new Float32Array(CONFIG.MAX_PARTICLES);
	private readonly candBase = new Float32Array(CONFIG.MAX_PARTICLES);
	// 1 = stream mote: no loner floor — an isolated deposit vanishes entirely
	private readonly candStream = new Uint8Array(CONFIG.MAX_PARTICLES);
	private readonly gridHead = new Int32Array(GRID_MAX ** 3);
	private readonly gridNext = new Int32Array(CONFIG.MAX_PARTICLES);
	// world-space pooled-mote scratch for the plume pass
	private readonly poolPos = new Float32Array(CONFIG.MAX_PARTICLES * 3);
	private readonly poolVel = new Float32Array(CONFIG.MAX_PARTICLES * 3);
	private element: SimElement = 'fire';

	constructor(scene: THREE.Scene) {
		this.materials = createVolumeMaterials(this.uTime, this.uPhase);
		this.mesh = new MarchingCubes(CONFIG.VOLUME_RES, this.materials.fire, false, false, 100000);
		this.mesh.scale.setScalar(SPAN / 2);
		this.mesh.position.set(0, Y0 + SPAN / 2, 0);
		this.mesh.frustumCulled = false;
		scene.add(this.mesh);
	}

	setElement(element: SimElement): void {
		this.element = element;
		this.mesh.material = this.materials[element];
	}

	/** Record one cohesion candidate (velocity read at packed index i). */
	private pushCandidate(
		j: number,
		bx: number,
		by: number,
		bz: number,
		fade: number,
		vel: Float32Array,
		i: number,
		base: number,
		stream: 0 | 1
	): void {
		this.candPos[j * 3] = bx;
		this.candPos[j * 3 + 1] = by;
		this.candPos[j * 3 + 2] = bz;
		this.candVel[j * 3] = vel[i * 3];
		this.candVel[j * 3 + 1] = vel[i * 3 + 1];
		this.candVel[j * 3 + 2] = vel[i * 3 + 2];
		this.candFade[j] = fade;
		this.candBase[j] = base;
		this.candStream[j] = stream;
	}

	/**
	 * Face-neighbor diffusion of the metaball field (preallocated buffer —
	 * the addon's blur() slices a 1 MB copy per call). Bridges blobs that are
	 * a cell or two apart, which is what fuses a stream into one surface.
	 */
	private smoothField(intensity: number): void {
		const f = this.mesh.field as Float32Array;
		const n = CONFIG.VOLUME_RES;
		const n2 = n * n;
		const c = this.fieldCopy;
		c.set(f);
		for (let z = 1; z < n - 1; z++) {
			for (let y = 1; y < n - 1; y++) {
				let i = n2 * z + n * y + 1;
				for (let x = 1; x < n - 1; x++, i++) {
					const nb = c[i - 1] + c[i + 1] + c[i - n] + c[i + n] + c[i - n2] + c[i + n2];
					f[i] = c[i] + intensity * (nb / 6 - c[i]);
				}
			}
		}
	}

	/** Deposit a smeared metaball pair at a (grid-normalized) position. */
	private deposit(
		bx: number,
		by: number,
		bz: number,
		fade: number,
		vx: number,
		vy: number,
		vz: number,
		base: number,
		smear: number
	): void {
		// fade-scaled strength: balls swell in on spawn and shrink out on death
		const s = CONFIG.VOLUME_STRENGTH * base * (0.35 + 0.65 * fade);
		// smear along the local velocity: fast matter becomes bead-pairs that
		// fuse into streams along the flow, slow pools stay compact blobs. The
		// offset is capped — past the cohesion radius a pair stops fusing and
		// the body tears into beads (the whirl's speeds would triple it)
		let ox = vx * smear;
		let oy = vy * smear;
		let oz = vz * smear;
		const ol = Math.hypot(ox, oy, oz);
		const cap = CONFIG.VOLUME_SMEAR_MAX / SPAN;
		if (ol > cap) {
			ox *= cap / ol;
			oy *= cap / ol;
			oz *= cap / ol;
		}
		this.mesh.addBall(bx, by, bz, s, CONFIG.VOLUME_SUBTRACT);
		this.mesh.addBall(bx - ox, by - oy, bz - oz, s, CONFIG.VOLUME_SUBTRACT);
	}

	/**
	 * Cohesion: contract each deposit toward the centroid of the tracers within
	 * VOLUME_COHESION_R, and let deposit strength grow with neighbour count.
	 * Gaps in the cloud close into one connected surface; stragglers thin out
	 * and pinch off as small droplets instead of full-size bubbles. Deposit-side
	 * only — tracer motion is untouched.
	 */
	private cohereAndDeposit(count: number, coh: number, smear: number): void {
		const rN = CONFIG.VOLUME_COHESION_R / SPAN;
		const gn = Math.min(GRID_MAX, Math.max(1, Math.floor(1 / rN)));
		const cand = this.candPos;
		const head = this.gridHead.fill(-1, 0, gn * gn * gn);
		const next = this.gridNext;
		const cellOf = (j: number) => {
			const cx = Math.min(gn - 1, (cand[j * 3] * gn) | 0);
			const cy = Math.min(gn - 1, (cand[j * 3 + 1] * gn) | 0);
			const cz = Math.min(gn - 1, (cand[j * 3 + 2] * gn) | 0);
			return (cz * gn + cy) * gn + cx;
		};
		for (let j = 0; j < count; j++) {
			const c = cellOf(j);
			next[j] = head[c];
			head[c] = j;
		}
		const r2 = rN * rN;
		for (let j = 0; j < count; j++) {
			const x = cand[j * 3],
				y = cand[j * 3 + 1],
				z = cand[j * 3 + 2];
			const cx = Math.min(gn - 1, (x * gn) | 0);
			const cy = Math.min(gn - 1, (y * gn) | 0);
			const cz = Math.min(gn - 1, (z * gn) | 0);
			let k = 0,
				mx = 0,
				my = 0,
				mz = 0;
			for (let dz = -1; dz <= 1; dz++) {
				const zc = cz + dz;
				if (zc < 0 || zc >= gn) continue;
				for (let dy = -1; dy <= 1; dy++) {
					const yc = cy + dy;
					if (yc < 0 || yc >= gn) continue;
					for (let dx = -1; dx <= 1; dx++) {
						const xc = cx + dx;
						if (xc < 0 || xc >= gn) continue;
						for (let o = head[(zc * gn + yc) * gn + xc]; o !== -1; o = next[o]) {
							const ex = cand[o * 3] - x,
								ey = cand[o * 3 + 1] - y,
								ez = cand[o * 3 + 2] - z;
							if (ex * ex + ey * ey + ez * ez > r2) continue;
							k++;
							mx += cand[o * 3];
							my += cand[o * 3 + 1];
							mz += cand[o * 3 + 2];
						}
					}
				}
			}
			// k ≥ 1 (self); tracer loners keep their spot at floor strength, but a
			// sparse STREAM mote deposits nothing — any ball's core cell crosses
			// the isosurface no matter how weak, so density is the only popcorn
			// gate. Only a crowded river reads as matter.
			if (this.candStream[j] && k < CONFIG.STREAM_KMIN) continue;
			const t = Math.min(1, (k - 1) / Math.max(1, CONFIG.VOLUME_COHESION_K - 1));
			const loner = this.candStream[j] ? 0 : CONFIG.VOLUME_LONER;
			const w = loner + (1 - loner) * t;
			const pull = coh * t; // stragglers aren't yanked toward a far-off body
			this.deposit(
				x + (mx / k - x) * pull,
				y + (my / k - y) * pull,
				z + (mz / k - z) * pull,
				this.candFade[j],
				this.candVel[j * 3],
				this.candVel[j * 3 + 1],
				this.candVel[j * 3 + 2],
				this.candBase[j] * w,
				smear
			);
		}
	}

	/**
	 * Re-deposit every alive tracer as a metaball and re-polygonize. Pooled
	 * ambient motes (the pull's collected mass, §7) deposit as still balls —
	 * and, per the element's look, sprout the plume and skin the fast inflow
	 * as velocity-smeared ribbons, so gathered matter reads as one body.
	 */
	update(p: Particles3D, ambient?: AmbientSource): void {
		const m = this.mesh;
		const look = LOOKS[this.element];
		// re-read CONFIG every frame so live tuning via __wha applies
		m.isolation = CONFIG.VOLUME_ISOLATION * look.isoScale;
		m.reset();
		const coh = CONFIG.VOLUME_COHESION * look.cohesion;
		const smear = (CONFIG.VOLUME_SMEAR * 1.5 * look.smearScale) / SPAN;
		let balls = 0;
		let cands = 0;
		for (let i = 0; i < CONFIG.MAX_PARTICLES && balls < CONFIG.VOLUME_MAX_BALLS; i++) {
			if (!p.alive[i]) continue;
			const bx = (p.pos[i * 3] + SPAN / 2) / SPAN;
			const by = (p.pos[i * 3 + 1] - Y0) / SPAN;
			const bz = (p.pos[i * 3 + 2] + SPAN / 2) / SPAN;
			if (bx < 0 || bx > 1 || by < 0 || by > 1 || bz < 0 || bz > 1) continue;
			if (coh > 0) {
				// cohesive elements defer: deposits need the whole cloud first
				this.pushCandidate(cands++, bx, by, bz, p.fade[i], p.vel, i, 0.6, 0);
			} else {
				const v = p.vel;
				this.deposit(bx, by, bz, p.fade[i], v[i * 3], v[i * 3 + 1], v[i * 3 + 2], 0.6, smear);
			}
			balls++;
		}

		// the inflow river joins the candidate cloud: crowding gates it, so the
		// spiral arms fuse into ribbons while stray far motes deposit nothing
		// (stream needs cohesion > 0 — without the crowd gate it would popcorn)
		if (look.stream > 0 && coh > 0 && ambient?.forEachStreaming) {
			ambient.forEachStreaming((x, y, z, vx, vy, vz, w) => {
				if (balls >= CONFIG.VOLUME_MAX_BALLS) return;
				const bx = (x + SPAN / 2) / SPAN;
				const by = (y - Y0) / SPAN;
				const bz = (z + SPAN / 2) / SPAN;
				if (bx < 0 || bx > 1 || by < 0 || by > 1 || bz < 0 || bz > 1) return;
				streamVel[0] = vx;
				streamVel[1] = vy;
				streamVel[2] = vz;
				const base = CONFIG.STREAM_STRENGTH * look.stream * w;
				this.pushCandidate(cands++, bx, by, bz, 1, streamVel, 0, base, 1);
				balls++;
			});
		}

		// pooled mass: recorded for the plume pass, and — when the element
		// coheres — crowd-gated like the stream, so the churning pool fringe
		// stays glowing dots instead of a ring of orbiting gobbets. Deposits
		// carry the mote's real velocity (the whirl smears them into ribbons)
		// and fatten with heat: thick at the vortex foot, thin at the crown.
		let pooledN = 0;
		const poolHGate = ambient?.poolHeight?.() ?? 0;
		const poolPh = ambient?.poolPhase?.() ?? 0;
		ambient?.forEachPooled((x, y, z, vx, vy, vz, heat) => {
			if (pooledN < CONFIG.MAX_PARTICLES) {
				this.poolPos[pooledN * 3] = x;
				this.poolPos[pooledN * 3 + 1] = y;
				this.poolPos[pooledN * 3 + 2] = z;
				this.poolVel[pooledN * 3] = vx;
				this.poolVel[pooledN * 3 + 1] = vy;
				this.poolVel[pooledN * 3 + 2] = vz;
				pooledN++;
			}
			// bodiless elements (wind) keep their gathered heap as glowing dots
			if (!look.pool) return;
			if (balls >= CONFIG.VOLUME_MAX_BALLS) return;
			// while the vortex burns, motes still easing in from their latch spot
			// stay glowing dots — transient fringe crowds would skin into a ring
			// of orbiting gobbets around the funnel foot. Distance is measured
			// from the lashing centerline so the whipping crown keeps its body;
			// the gate loosens with height, where sparse laggards are the body
			if (poolHGate > 0) {
				const gate = 1.25 + 0.5 * Math.min(1, y / poolHGate);
				if (Math.hypot(x - swayX(y, poolPh), z - swayZ(y, poolPh)) > funnelR(y, poolHGate) * gate)
					return;
			}
			const bx = (x + SPAN / 2) / SPAN;
			const by = (y - Y0) / SPAN;
			const bz = (z + SPAN / 2) / SPAN;
			if (bx < 0 || bx > 1 || by < 0 || by > 1 || bz < 0 || bz > 1) return;
			streamVel[0] = vx;
			streamVel[1] = vy;
			streamVel[2] = vz;
			const base = 0.55 + 0.45 * heat;
			if (coh > 0) {
				this.pushCandidate(cands++, bx, by, bz, 1, streamVel, 0, base, 1);
			} else {
				m.addBall(bx, by, bz, CONFIG.VOLUME_STRENGTH * base, CONFIG.VOLUME_SUBTRACT);
			}
			balls++;
		});
		if (coh > 0) this.cohereAndDeposit(cands, coh, smear);
		if (look.plume > 0 && pooledN > 0 && poolHGate > 0) {
			balls += depositPlume(
				m,
				this.poolPos,
				this.poolVel,
				pooledN,
				poolHGate * look.plume,
				poolPh,
				SPAN,
				Y0,
				CONFIG.VOLUME_MAX_BALLS - balls
			);
		}
		// the Γ_p twist tornado's trunk: elements whose fast flow skins (stream,
		// which also implies the cohesion the ribbons need) get guaranteed cords
		// on the physics funnel — the streaming lane's ribbons thicken them.
		// Bodiless elements (wind) stay a whirlwind of streaks.
		const funnel = ambient?.twistFunnel?.();
		if (funnel && look.stream > 0 && coh > 0) {
			balls += depositTwistFunnel(
				m,
				funnel.h,
				funnel.r0,
				funnel.r1,
				poolPh,
				SPAN,
				Y0,
				CONFIG.VOLUME_MAX_BALLS - balls
			);
		}
		for (let k = 0; k < look.smoothPasses; k++) this.smoothField(look.smooth);
		m.update();
		this.uTime.value = performance.now() / 1000;
		this.uPhase.value = poolPh;
	}
}
