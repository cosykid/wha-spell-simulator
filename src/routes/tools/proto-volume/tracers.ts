/**
 * @file The CPU tracer cloud styles A and C skin: spawned from the seal mouth
 * on the arc's envelopes, advected per fixed step by the element's own physics
 * (elements.ts MOTION), aged and faded. The marching-cubes skin only watches
 * the arrays; nothing here draws.
 *
 * Seal space: x/y in the paper plane, z up off it, one unit = the ring radius.
 */

import { mulberry32 } from '$lib/cast/rng.js';
import { MOTION, type MotionSpec, type ProtoElement } from './elements.js';
import { burnAt, drainAt, driveAt, emissionAt, punchAt } from './arc.js';
import { curl, vnoise } from './noise.js';
import type { ProtoSpell } from './spell.js';

export const STEP_S = 1 / 60;
export const TRACER_MAX = 2600;

const scratch = { x: 0, y: 0, z: 0 };

export class Tracers {
	readonly pos = new Float32Array(TRACER_MAX * 3);
	readonly vel = new Float32Array(TRACER_MAX * 3);
	readonly alive = new Uint8Array(TRACER_MAX);
	readonly fade = new Float32Array(TRACER_MAX);
	readonly pooled = new Uint8Array(TRACER_MAX);
	readonly #age = new Float32Array(TRACER_MAX);
	readonly #life = new Float32Array(TRACER_MAX);
	readonly #spell: ProtoSpell;
	readonly #spec: MotionSpec;
	readonly #seed: number;
	#rng: () => number;
	#carry = 0;
	#aliveCount = 0;
	#pooledCount = 0;

	constructor(spell: ProtoSpell, element: ProtoElement, seed: number) {
		this.#spell = spell;
		this.#spec = MOTION[element];
		this.#seed = seed;
		this.#rng = mulberry32(seed);
	}

	get aliveCount(): number {
		return this.#aliveCount;
	}

	/** Fraction of the population sitting in the ground pool. Water's gauge. */
	get pooledFraction(): number {
		return this.#aliveCount === 0 ? 0 : this.#pooledCount / this.#aliveCount;
	}

	reset(): void {
		this.alive.fill(0);
		this.pooled.fill(0);
		this.fade.fill(0);
		this.#carry = 0;
		this.#aliveCount = 0;
		this.#pooledCount = 0;
		this.#rng = mulberry32(this.#seed);
	}

	/** One fixed step of spawn, forces, integration and ageing. */
	step(tMs: number): void {
		const spell = this.#spell;
		const spec = this.#spec;
		const t = tMs / 1000;
		const dt = STEP_S;
		const punch = punchAt(spell, tMs);
		const drive = driveAt(spell, tMs);
		const burn = burnAt(spell, tMs);
		const drain = drainAt(spell, tMs);
		this.#spawn(tMs, punch, drive);

		const reach = spell.reach;
		let aliveCount = 0;
		let pooledCount = 0;
		for (let i = 0; i < TRACER_MAX; i += 1) {
			if (!this.alive[i]) continue;
			const px = this.pos[i * 3];
			const py = this.pos[i * 3 + 1];
			const pz = this.pos[i * 3 + 2];
			let vx = this.vel[i * 3];
			let vy = this.vel[i * 3 + 1];
			let vz = this.vel[i * 3 + 2];
			const life = this.#life[i];
			const t01 = Math.min(1, this.#age[i] / life);
			const heat = 1 - t01;
			const hn = Math.min(1.6, Math.max(0, pz / reach));
			const radius = Math.hypot(px, py);
			const inx = radius > 1e-4 ? -px / radius : 0;
			const iny = radius > 1e-4 ? -py / radius : 0;

			if (this.pooled[i]) {
				// The puddle: horizontal momentum bleeding out plus a gentle spread.
				vx += -inx * spec.pool!.spread * dt;
				vy += -iny * spec.pool!.spread * dt;
				const keep = Math.exp(-spec.pool!.dragXY * dt);
				vx *= keep;
				vy *= keep;
				vz = 0;
			} else {
				vz += spec.buoyancy * Math.pow(heat, 1.15) * dt;
				vz -= spec.gravity * dt;
				if (spec.pinch > 0) {
					const wob = 1 + 0.5 * vnoise(px * 1.5, py * 1.5, t * 0.6 + pz * 1.3);
					const boundary =
						(spell.footprint * (1 - 0.62 * smooth01(hn / 0.95)) + 0.04) * Math.max(0.4, wob);
					const pull = spec.pinch * Math.max(radius - boundary, 0);
					vx += inx * pull * dt;
					vy += iny * pull * dt;
				}
				curl(px * spec.turbScale, py * spec.turbScale, pz * spec.turbScale - t * 0.7, scratch);
				const gain =
					spec.turbulence * (0.48 + 1.4 * smooth01(hn / 0.55) + 0.55 * punch) * (0.5 + 0.7 * t01);
				vx += scratch.x * gain * dt;
				vy += scratch.y * gain * dt;
				vz += scratch.z * gain * 0.7 * dt;
				if (spec.gust > 0) {
					vx += spec.gust * Math.sin(t * 1.35 + pz * 1.1 + i * 0.013) * dt;
					vy += spec.gust * 0.55 * Math.cos(t * 0.9 + pz * 0.8 + i * 0.007) * dt;
				}
				vx += -iny * spec.swirl * radius * dt;
				vy += inx * spec.swirl * radius * dt;
				const keep = Math.exp(-spec.drag * dt);
				vx *= keep;
				vy *= keep;
				vz *= keep;
			}

			let nx = px + vx * dt;
			let ny = py + vy * dt;
			let nz = pz + vz * dt;

			// Water's floor: land, splash a little, then join the pool.
			const pool = spec.pool;
			if (pool && !this.pooled[i] && nz <= pool.floorZ && vz < 0) {
				nz = pool.floorZ;
				vz = -vz * pool.bounce;
				if (vz < 0.16) {
					this.pooled[i] = 1;
					vz = 0;
				}
			}

			let ageRate = 1;
			if (this.pooled[i]) {
				ageRate = pool!.ageRate + pool!.drainAgeRate * drain;
			} else if (hn > spec.tearFrom) {
				ageRate = spec.tearRate;
			}
			this.#age[i] += dt * burn * ageRate;

			const dead =
				this.#age[i] >= life ||
				nz > spec.heightCap * reach ||
				Math.hypot(nx, ny) > 2.1 ||
				nz < -0.05;
			if (dead) {
				this.alive[i] = 0;
				this.pooled[i] = 0;
				this.fade[i] = 0;
				continue;
			}
			this.pos[i * 3] = nx;
			this.pos[i * 3 + 1] = ny;
			this.pos[i * 3 + 2] = nz;
			this.vel[i * 3] = vx;
			this.vel[i * 3 + 1] = vy;
			this.vel[i * 3 + 2] = vz;
			let fade = Math.min(this.#age[i] / 0.25, 1) * (1 - t01);
			// Above the tear line a tip melts as it rises, gone within 0.4 units,
			// so the crown thins to nothing rather than freezing into stray
			// grid-sized chips.
			if (spec.tearFrom < 2) {
				fade *= 1 - 0.9 * smooth01((hn - spec.tearFrom) / 0.5);
			}
			this.fade[i] = fade;
			aliveCount += 1;
			if (this.pooled[i]) pooledCount += 1;
		}
		this.#aliveCount = aliveCount;
		this.#pooledCount = pooledCount;
	}

	#spawn(tMs: number, punch: number, drive: number): void {
		const spell = this.#spell;
		const spec = this.#spec;
		const rng = this.#rng;
		const rate = spec.spawnPerSec * emissionAt(spell, tMs) * (1 + 2.4 * punch);
		this.#carry += rate * STEP_S;
		let births = Math.floor(this.#carry);
		this.#carry -= births;
		let cursor = 0;
		while (births-- > 0) {
			while (cursor < TRACER_MAX && this.alive[cursor]) cursor += 1;
			if (cursor >= TRACER_MAX) break;
			const i = cursor;
			const speed = spell.speed * drive;
			let dirX: number;
			let dirY: number;
			if (spec.jets > 0) {
				// Water: one of a few slowly precessing sub-jets, so the launch
				// braids into distinct arcs rather than one cone.
				const jet = Math.floor(rng() * spec.jets);
				const angle =
					(jet / spec.jets) * Math.PI * 2 + (tMs / 1000) * spec.jetSpinRadS + (rng() - 0.5) * 0.5;
				dirX = Math.cos(angle);
				dirY = Math.sin(angle);
			} else {
				const angle = rng() * Math.PI * 2;
				dirX = Math.cos(angle);
				dirY = Math.sin(angle);
			}
			const mouth = spec.mouth * spell.footprint * Math.sqrt(rng());
			const ma = rng() * Math.PI * 2;
			this.alive[i] = 1;
			this.pooled[i] = 0;
			this.#age[i] = 0;
			this.#life[i] = spec.lifeLo + rng() * (spec.lifeHi - spec.lifeLo);
			this.pos[i * 3] = Math.cos(ma) * mouth;
			this.pos[i * 3 + 1] = Math.sin(ma) * mouth;
			this.pos[i * 3 + 2] = 0.01 + 0.05 * rng();
			const radial = speed * (spec.radialLo + rng() * (spec.radialHi - spec.radialLo));
			this.vel[i * 3] = dirX * radial;
			this.vel[i * 3 + 1] = dirY * radial;
			this.vel[i * 3 + 2] = speed * (spec.riseLo + rng() * (spec.riseHi - spec.riseLo));
			this.fade[i] = 0;
		}
	}
}

function smooth01(t: number): number {
	const v = t < 0 ? 0 : t > 1 ? 1 : t;
	return v * v * (3 - 2 * v);
}
