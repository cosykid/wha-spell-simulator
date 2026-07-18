/**
 * @file Passive tracer particles: Ẋ = u(X), ported from the theorycrafting
 * sim. Spawned by rejection sampling of the manifestation mask (the spawn
 * footprint IS the wiki demo diagrams' red region), absorbed when they stray
 * behind a fence, faded by age.
 *
 * The app adds a per-frame `drive`: emission gates the spawn to the spell's
 * duration window, power (drawing quality) and speed (quality × sigil size)
 * scale throughput and flow — canon's messy-seals-weaken rule, which the sim
 * demo never modeled.
 */
import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { sampleVelocity } from '../core/field.js';
import { setV3, v2, v3 } from '../core/math2.js';
import { PopulationMechanics, vesselClamp, vesselPass } from '../core/mechanics.js';
import { spawnWeight, type Nozzle } from '../core/nozzle.js';
import { softDotTexture } from './softDot.js';

export interface EffectDrive {
	/** 0..1 spell-duration gate; 0 while the portal opens, fades out at the end. */
	emission: number;
	/** Spawn-rate multiplier from drawing quality (η in GROUND_TRUTH §1). */
	power: number;
	/** Velocity multiplier from quality × sigil size. */
	speed: number;
}

const tmpVel = v3();
const tmpPos = v3();

export class Particles3D {
	readonly points: THREE.Points;
	private readonly max = CONFIG.MAX_PARTICLES;
	// pos/vel/alive/fade are read by ElementVolume3D to skin the cloud
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
		// faint by default since the element volume carries the look: dots just
		// hint at the motion inside the skin
		this.mat = new THREE.PointsMaterial({
			size: CONFIG.POINT_SIZE,
			map: softDotTexture(),
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

	/** Tracers-only view, used when the volume skin is off. */
	setStandalone(standalone: boolean): void {
		this.mat.opacity = standalone ? 0.9 : 0.3;
		this.mat.size = standalone ? CONFIG.POINT_SIZE * 1.6 : CONFIG.POINT_SIZE;
	}

	/** Any tracers still on stage? Lets the effect finish its fade-out. */
	hasAlive(): boolean {
		for (let i = 0; i < this.max; i++) {
			if (this.alive[i]) return true;
		}
		return false;
	}

	setSeal(nozzle: Nozzle | null, colorHex: number): void {
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

	update(dt: number, drive: EffectDrive): void {
		const n = this.nozzle;
		if (!n) return;

		// ---- spawn (rejection-sampled by mask × proximity) --------------------
		// §7 manifestation ruling: a pull-only seal manifests nothing — the
		// ambient population is its whole output. §6 fill-to-capacity: the feed
		// tapers as the held ball fills and stops once it is full.
		let spawnScale = n.manifests ? 1 : 0;
		if (n.lev?.grip && n.lev.C > 0 && n.lev.cap > 0)
			spawnScale = Math.max(0, 1 - this.held / n.lev.cap);
		spawnScale *= drive.emission * drive.power;
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
			setV3(tmpPos, this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
			this.masks[i] = sampleVelocity(n, tmpPos, tmpVel);
			this.vel[i * 3] = tmpVel.x * drive.speed;
			this.vel[i * 3 + 1] = tmpVel.y * drive.speed;
			this.vel[i * 3 + 2] = tmpVel.z * drive.speed;
		}

		// ---- population pass (§8): excluded volume + rigidity -------------------
		this.mechanics.apply(this.pos, this.vel, this.alive, this.max, n.Q, dt);

		// ---- integrate ----------------------------------------------------------
		let held = 0;
		for (let i = 0; i < this.max; i++) {
			if (!this.alive[i]) continue;
			const mask = this.masks[i];
			// §9 vessel (population-blind): own magic inside a shell is contained
			const inVessel = n.orb ? vesselPass(n.orb, this.pos, this.vel, i) : false;
			setV3(
				tmpPos,
				this.pos[i * 3] + this.vel[i * 3] * dt,
				this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt,
				this.pos[i * 3 + 2] + this.vel[i * 3 + 2] * dt
			);
			if (inVessel) vesselClamp(n.orb!, tmpPos);

			// disk wall (belt and braces: the field already zeroes u_y here)
			const rho = Math.hypot(tmpPos.x, tmpPos.z);
			if (rho < 1 && tmpPos.y < 0.015) tmpPos.y = 0.015;

			// held magic is sustained: tracers stop aging while churning in the
			// blob, so the feed accumulates into the ball instead of cycling
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
			// held forms release once the spell ends: age resumes on fade-out
			if (drive.emission < 1) ageRate = Math.max(ageRate, 1);
			this.age[i] += dt * ageRate;
			const dead =
				this.age[i] > this.life[i] ||
				Math.hypot(tmpPos.x, tmpPos.y, tmpPos.z) > CONFIG.KILL_DIST ||
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

			const fade =
				Math.min(this.age[i] / 0.25, 1) * (1 - this.age[i] / this.life[i]) * drive.emission;
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
