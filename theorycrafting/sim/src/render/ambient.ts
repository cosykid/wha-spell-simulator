/**
 * The ambient medium (GROUND_TRUTH §7 ruling): every element exists as a thin
 * cloud of motes seeded through the domain, so "there is air here" is visible
 * even when nothing pulls. Advected by u_amb only — never by the own-magic
 * field — and never absorbed: the medium persists. Motes that pool in the
 * grasp cushion count toward the capacitor charge; the pull field throttles
 * by the remaining fraction and dies at capacity.
 *
 * Under an orb vessel (§9) the population gains three things: the pour
 * spawner (a demo boundary condition — extra motes streamed in from a spout),
 * the excluded-volume pass (pooling and the geometric capacity are population
 * effects), and the shell itself (settle + stir + one-way clip, in
 * mechanics.ts). Shell-contained motes count against the pull grasp capacity
 * — the shell is a raised grasp (§9 ruling).
 */
import * as THREE from 'three';
import { CONFIG } from './../config';
import { sampleAmbientVelocity } from './../field';
import { mulberry32 } from './../math2';
import { PopulationMechanics, vesselClamp, vesselContains, vesselPass } from './../mechanics';
import type { Nozzle } from './../nozzle';

const tmpVel = new THREE.Vector3();
const tmpPos = new THREE.Vector3();

export class AmbientMedium {
	readonly points: THREE.Points;
	private readonly mediumMax = CONFIG.AMBIENT_COUNT;
	private readonly max = CONFIG.AMBIENT_COUNT + CONFIG.POUR_COUNT;
	readonly pos: Float32Array;
	private readonly vel: Float32Array;
	private readonly alive: Uint8Array;
	grasped = 0; //   capacitor charge: latched pool + shell-contained (§9 ruling)
	contained = 0; // motes held by the vessel shell (§9)
	private readonly held: Uint8Array;
	private nozzle: Nozzle | null = null;
	private pouring = false;
	private pourCarry = 0;
	private pourNext = 0; // next inactive pour mote (they live past mediumMax)
	private readonly mechanics: PopulationMechanics;
	private readonly col: Float32Array;
	private readonly geo: THREE.BufferGeometry;
	private readonly mat: THREE.PointsMaterial;
	private rand: () => number = mulberry32(7);

	constructor(scene: THREE.Scene) {
		this.pos = new Float32Array(this.max * 3);
		this.vel = new Float32Array(this.max * 3);
		this.col = new Float32Array(this.max * 3);
		this.held = new Uint8Array(this.max);
		this.alive = new Uint8Array(this.max);
		this.mechanics = new PopulationMechanics(this.max);
		this.pos.fill(-999); // park inactive pour motes far away
		this.geo = new THREE.BufferGeometry();
		this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
		this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
		this.mat = new THREE.PointsMaterial({
			size: CONFIG.POINT_SIZE * 0.9,
			vertexColors: true,
			transparent: true,
			opacity: 0.5,
			depthWrite: false,
			blending: THREE.AdditiveBlending
		});
		this.points = new THREE.Points(this.geo, this.mat);
		this.points.frustumCulled = false;
		scene.add(this.points);
	}

	/** Capacitor state: 1 = empty (full pull), 0 = charged (pull dead). */
	throttle(): number {
		const cap = this.nozzle?.pull?.cap ?? 0;
		if (cap <= 0) return 1;
		return Math.max(0, 1 - this.grasped / cap);
	}

	private seedOne(i: number): void {
		// uniform in a cylinder over the seal, hugging nothing: the medium is thin
		const r = CONFIG.AMBIENT_R * Math.sqrt(this.rand());
		const th = this.rand() * 2 * Math.PI;
		this.pos[i * 3] = r * Math.cos(th);
		this.pos[i * 3 + 1] = 0.05 + this.rand() * CONFIG.AMBIENT_H;
		this.pos[i * 3 + 2] = r * Math.sin(th);
	}

	setSeal(nozzle: Nozzle, colorHex: number, seed = 7, pour = false): void {
		this.nozzle = nozzle;
		this.rand = mulberry32(seed);
		this.grasped = 0;
		this.contained = 0;
		this.held.fill(0);
		this.alive.fill(0);
		this.pos.fill(-999);
		this.pouring = pour && !!nozzle.orb;
		this.pourCarry = 0;
		this.pourNext = this.mediumMax;
		const c = new THREE.Color(colorHex);
		// the medium only shows for seals that address it — a pull-less, orb-less
		// seal keeps the stage clear (motes would be dead weight on old presets)
		this.points.visible = !!nozzle.pull || !!nozzle.orb;
		for (let i = 0; i < this.mediumMax; i++) {
			this.seedOne(i);
			this.alive[i] = 1;
			// dimmed element color: same substance as the spell's magic, quieter
			this.col[i * 3] = c.r * 0.5;
			this.col[i * 3 + 1] = c.g * 0.5;
			this.col[i * 3 + 2] = c.b * 0.5;
		}
		for (let i = this.mediumMax; i < this.max; i++) {
			// poured matter is the element proper, not the thin haze — brighter
			this.col[i * 3] = c.r * 0.85;
			this.col[i * 3 + 1] = c.g * 0.85;
			this.col[i * 3 + 2] = c.b * 0.85;
		}
		this.geo.attributes.position.needsUpdate = true;
		this.geo.attributes.color.needsUpdate = true;
	}

	update(dt: number): void {
		const n = this.nozzle;
		if (!n || (!n.pull && !n.orb)) return;
		const orb = n.orb;

		// ---- pour spawner (§9 boundary condition): a stream from the spout ----
		if (this.pouring && orb) {
			this.pourCarry += CONFIG.POUR_RATE * dt;
			let m = Math.floor(this.pourCarry);
			this.pourCarry -= m;
			while (m-- > 0 && this.pourNext < this.max) {
				const i = this.pourNext++;
				this.alive[i] = 1;
				const a = this.rand() * 2 * Math.PI;
				const rr = 0.07 * Math.sqrt(this.rand());
				this.pos[i * 3] = orb.x.x + rr * Math.cos(a);
				this.pos[i * 3 + 1] = orb.h + orb.radius + CONFIG.POUR_DROP + this.rand() * 0.1;
				this.pos[i * 3 + 2] = orb.x.y + rr * Math.sin(a);
			}
		}

		const cap = n.pull?.cap ?? 0;
		const thr = this.throttle();
		const sink = (n.pull?.C ?? 0) > 0;
		let latched = 0;
		for (let i = 0; i < this.max; i++) if (this.held[i]) latched++;

		// ---- velocity pass ------------------------------------------------------
		for (let i = 0; i < this.max; i++) {
			if (!this.alive[i] || this.held[i]) continue;
			tmpPos.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
			sampleAmbientVelocity(n, tmpPos, tmpVel, thr);
			// the pour's downward drive rides its motes until the shell takes them
			if (orb && i >= this.mediumMax && !vesselContains(orb, tmpPos.x, tmpPos.y, tmpPos.z))
				tmpVel.y -= CONFIG.POUR_SPEED;
			this.vel[i * 3] = tmpVel.x;
			this.vel[i * 3 + 1] = tmpVel.y;
			this.vel[i * 3 + 2] = tmpVel.z;
		}

		// ---- population pass (§9): under a vessel the medium occupies volume —
		// bottom-up pooling and the geometric capacity are population effects
		if (orb) this.mechanics.apply(this.pos, this.vel, this.alive, this.max, n.Q, dt);

		// ---- vessel + integrate + walls + latches -------------------------------
		let contained = 0;
		for (let i = 0; i < this.max; i++) {
			if (!this.alive[i]) continue;
			// held motes are the grasp: sustained in place, never released (v1 —
			// discharge is GROUND_TRUTH §12.8)
			if (this.held[i]) continue;
			const inside = orb ? vesselPass(orb, this.pos, this.vel, i) : false;
			tmpPos.set(
				this.pos[i * 3] + this.vel[i * 3] * dt,
				this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt,
				this.pos[i * 3 + 2] + this.vel[i * 3 + 2] * dt
			);
			if (inside) {
				vesselClamp(orb!, tmpPos);
				contained++;
			}

			// disk wall: pooled matter sits ON the seal, not in it
			const rho = Math.hypot(tmpPos.x, tmpPos.z);
			if (rho < 1 && tmpPos.y < 0.015) tmpPos.y = 0.015;
			// spilled pour water rests on the atelier floor (scene furniture)
			if (i >= this.mediumMax && tmpPos.y < 0.015) tmpPos.y = 0.015;

			// grasp latch: a mote that stalls in the cushion is CAUGHT — state, not
			// a per-frame test (re-deriving it lets the freezing throttle count
			// every bystander in the cushion and overshoot capacity). The speed
			// gate keeps transiting matter (a conveyor carrying it across the
			// disk) from charging the grasp; a full grasp accepts nothing more.
			// Shell-contained motes belong to the vessel, not the cushion.
			if (
				!inside &&
				sink &&
				latched < cap &&
				rho < 1.02 &&
				tmpPos.y < CONFIG.GRASP_H &&
				Math.hypot(this.vel[i * 3], this.vel[i * 3 + 1], this.vel[i * 3 + 2]) < CONFIG.GRASP_V
			) {
				this.held[i] = 1;
				latched++;
			}

			// the medium is infinite: motes blown out of the domain (push mode)
			// are replaced by fresh ones elsewhere, never destroyed. Pour motes
			// are a finite bottle — they rest where they land.
			if (
				i < this.mediumMax &&
				!inside &&
				(Math.hypot(tmpPos.x, tmpPos.z) > CONFIG.AMBIENT_R * 1.25 ||
					tmpPos.y > CONFIG.AMBIENT_H * 1.35)
			) {
				this.seedOne(i);
				continue;
			}
			this.pos[i * 3] = tmpPos.x;
			this.pos[i * 3 + 1] = tmpPos.y;
			this.pos[i * 3 + 2] = tmpPos.z;
		}
		this.contained = contained;
		// §9 ruling: the shell is a raised grasp — contained matter counts
		// against G_max, so a filling canteen throttles its own intake
		this.grasped = latched + (orb && n.pull ? contained : 0);
		this.geo.attributes.position.needsUpdate = true;
	}
}
