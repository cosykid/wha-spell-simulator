/**
 * Passive tracer particles: Ẋ = u(X). Spawned by rejection sampling of the
 * manifestation mask (so the spawn footprint IS the demo diagrams' red region),
 * absorbed when they stray behind a fence, faded by age.
 */
import * as THREE from 'three';
import { CONFIG } from './../config';
import { sampleVelocity } from './../field';
import { PopulationMechanics, vesselClamp, vesselPass } from './../mechanics';
import { spawnWeight, type Nozzle } from './../nozzle';
import { v2 } from './../math2';

const tmpVel = new THREE.Vector3();
const tmpPos = new THREE.Vector3();

export class Particles {
	readonly points: THREE.Points;
	private readonly max = CONFIG.MAX_PARTICLES;
	// pos/vel/alive/fade are read by ElementVolume to skin the cloud each frame
	readonly pos: Float32Array;
	readonly vel: Float32Array;
	readonly alive = new Uint8Array(CONFIG.MAX_PARTICLES);
	readonly fade = new Float32Array(CONFIG.MAX_PARTICLES);
	private readonly col: Float32Array;
	private readonly age = new Float32Array(CONFIG.MAX_PARTICLES);
	private readonly life = new Float32Array(CONFIG.MAX_PARTICLES);
	private readonly masks = new Float32Array(CONFIG.MAX_PARTICLES);
	private readonly mechanics = new PopulationMechanics(CONFIG.MAX_PARTICLES);
	private readonly geo: THREE.BufferGeometry;
	private nozzle: Nozzle | null = null;
	private color = new THREE.Color(0xffffff);
	private spawnCarry = 0;
	private held = 0; // tracers churning inside the blob (the ball's fill gauge)
	private readonly mat: THREE.PointsMaterial;

	constructor(scene: THREE.Scene) {
		this.pos = new Float32Array(this.max * 3);
		this.vel = new Float32Array(this.max * 3);
		this.col = new Float32Array(this.max * 3);
		this.pos.fill(-999); // park dead particles far away
		this.geo = new THREE.BufferGeometry();
		this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
		this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
		// faint by default since ElementVolume carries the look: dots just hint
		// at the motion inside the skin. setStandalone() boosts them back up
		// when the volume shader is switched off.
		this.mat = new THREE.PointsMaterial({
			size: CONFIG.POINT_SIZE,
			vertexColors: true,
			transparent: true,
			opacity: 0.3,
			depthWrite: false,
			blending: THREE.AdditiveBlending
		});
		this.points = new THREE.Points(this.geo, this.mat);
		this.points.frustumCulled = false;
		scene.add(this.points);
	}

	/** Tracers-only view: sized/opacity'd to read on their own, not as a hint under a skin. */
	setStandalone(standalone: boolean): void {
		this.mat.opacity = standalone ? 0.9 : 0.3;
		this.mat.size = standalone ? CONFIG.POINT_SIZE * 1.6 : CONFIG.POINT_SIZE;
	}

	setSeal(nozzle: Nozzle, colorHex: number): void {
		this.nozzle = nozzle;
		this.color.setHex(colorHex);
		this.held = 0;
		this.alive.fill(0);
		this.fade.fill(0);
		this.pos.fill(-999);
		this.col.fill(0);
		this.geo.attributes.position.needsUpdate = true;
		this.geo.attributes.color.needsUpdate = true;
	}

	update(dt: number): void {
		const n = this.nozzle;
		if (!n) return;

		// ---- spawn (rejection-sampled by mask × proximity) --------------------
		// §7 manifestation ruling: a pull-only seal manifests nothing — the
		// ambient population is its whole output.
		// fill-to-capacity ruling (§6): the feed tapers as the held ball fills
		// (W_max ∝ C_lev) and manifestation stops once it is full
		let spawnScale = n.manifests ? 1 : 0;
		if (n.lev?.grip && n.lev.C > 0 && n.lev.cap > 0)
			spawnScale = Math.max(0, 1 - this.held / n.lev.cap);
		this.spawnCarry += CONFIG.SPAWN_TRIES_PER_S * spawnScale * dt;
		let tries = Math.floor(this.spawnCarry);
		this.spawnCarry -= tries;
		let cursor = 0;
		while (tries-- > 0) {
			const r = 1.32 * Math.sqrt(Math.random());
			const th = Math.random() * 2 * Math.PI;
			const sx = r * Math.cos(th);
			const sz = r * Math.sin(th);
			if (Math.random() >= spawnWeight(n, v2(sx, sz))) continue;
			while (cursor < this.max && this.alive[cursor]) cursor++;
			if (cursor >= this.max) break;
			const i = cursor;
			this.alive[i] = 1;
			this.age[i] = 0;
			this.life[i] = CONFIG.LIFE_MIN + Math.random() * (CONFIG.LIFE_MAX - CONFIG.LIFE_MIN);
			this.pos[i * 3] = sx;
			this.pos[i * 3 + 1] = 0.02 + Math.random() * 0.03;
			this.pos[i * 3 + 2] = sz;
		}

		// ---- field pass: sample u(X) for every tracer --------------------------
		for (let i = 0; i < this.max; i++) {
			if (!this.alive[i]) continue;
			tmpPos.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
			this.masks[i] = sampleVelocity(n, tmpPos, tmpVel);
			this.vel[i * 3] = tmpVel.x;
			this.vel[i * 3 + 1] = tmpVel.y;
			this.vel[i * 3 + 2] = tmpVel.z;
		}

		// ---- population pass (§8): excluded volume + rigidity -------------------
		this.mechanics.apply(this.pos, this.vel, this.alive, this.max, n.Q, dt);

		// ---- integrate ----------------------------------------------------------
		let held = 0;
		for (let i = 0; i < this.max; i++) {
			if (!this.alive[i]) continue;
			const mask = this.masks[i];
			// §9 vessel (population-blind): own magic inside a shell is contained
			// too — settle, stir, one-way clip (only reachable via lev, §12.14)
			const inVessel = n.orb ? vesselPass(n.orb, this.pos, this.vel, i) : false;
			tmpVel.set(this.vel[i * 3], this.vel[i * 3 + 1], this.vel[i * 3 + 2]);
			tmpPos.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
			tmpPos.addScaledVector(tmpVel, dt);
			if (inVessel) vesselClamp(n.orb!, tmpPos);

			// disk wall (belt and braces: the field already zeroes u_y here)
			const rho = Math.hypot(tmpPos.x, tmpPos.z);
			if (rho < 1 && tmpPos.y < 0.015) tmpPos.y = 0.015;

			// held magic is sustained: tracers stop aging while churning in the
			// blob, so the feed *accumulates* into the ball instead of cycling —
			// and contained matter stops aging the same way (§9)
			let ageRate = 1;
			if (inVessel) ageRate = 0;
			const lv = n.lev;
			if (lv?.grip && lv.C > 0) {
				const d = Math.hypot(tmpPos.x - lv.x0.x, tmpPos.y - lv.h0, tmpPos.z - lv.x0.y);
				if (d < CONFIG.BLOB_R + CONFIG.BLOB_SOFT) {
					ageRate = CONFIG.HOLD_AGE;
					held++;
				}
			}
			this.age[i] += dt * ageRate;
			const dead =
				this.age[i] > this.life[i] ||
				tmpPos.length() > CONFIG.KILL_DIST ||
				(mask < CONFIG.KILL_MASK && this.age[i] > 0.4);
			if (dead) {
				this.alive[i] = 0;
				this.fade[i] = 0;
				this.pos[i * 3] = -999;
				this.pos[i * 3 + 1] = -999;
				this.pos[i * 3 + 2] = -999;
				this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0;
				continue;
			}
			this.pos[i * 3] = tmpPos.x;
			this.pos[i * 3 + 1] = tmpPos.y;
			this.pos[i * 3 + 2] = tmpPos.z;

			const fade = Math.min(this.age[i] / 0.25, 1) * (1 - this.age[i] / this.life[i]);
			this.fade[i] = fade;
			this.col[i * 3] = this.color.r * fade;
			this.col[i * 3 + 1] = this.color.g * fade;
			this.col[i * 3 + 2] = this.color.b * fade;
		}

		this.held = held;

		this.geo.attributes.position.needsUpdate = true;
		this.geo.attributes.color.needsUpdate = true;
	}
}
