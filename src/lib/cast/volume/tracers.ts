/**
 * @file One channel's tracer population: spawned from its flow's mouth on the
 * cell's envelopes, advected per fixed step by its element's physics under the
 * kind's own forces, aged, faded. The marching-cubes skin only watches these
 * arrays; nothing here draws, imports three.js, or reads a clock.
 *
 * Seal space: x/y in the paper plane, z up off it, one unit = the ring radius.
 * The step is the stage's own 120Hz product clock, so fresh-to-t and
 * incremental stepping reach bit-identical arrays.
 *
 * Two of ground truth section 8's population-wide mechanics act here beside
 * the per-tracer forces, both on the turbulence stride: the excluded volume
 * (manifested magic occupies room, so a crowd pushes back and a held ball
 * keeps the size its content dictates) and rigidity (focused magic relaxes
 * toward its neighbourhood's mean velocity and moves as one body). Who crowds
 * whom is `neighbourhood.ts`'s job, rebuilt from these arrays each stride step.
 */

import { MOTION, type MotionSpec, type VolumeElement } from './elements.js';
import { boundaryAt, spawnAt, type SpawnSite, type TrackFlow } from './flow.js';
import { FROZEN, LANDED, Neighbourhood } from './neighbourhood.js';
import { curl, smooth01 } from './noise.js';
import { HEAP, RIGIDITY_PER_FOCUS, STEP_S, TURBULENCE_STRIDE, WASH_GAUGE } from './tuning.js';
import { mulberry32 } from '../rng.js';

const scratch = { x: 0, y: 0, z: 0 };
const site: SpawnSite = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1 };

/** Matter this young may not set: it has to leave the mouth first. */
const SETTLE_AFTER_S = 0.2;

/** How fast a landed tracer rises onto its heap, per second. */
const HEAP_RATE = 5;

/** What the cast's seal does to every tracer of it, whatever the kind or element. */
export interface CastPhysics {
	/** The plan's lens factor, 1 with no convergence ink (R-13, ground truth section 8). */
	focus: number;
}

export const UNFOCUSED: CastPhysics = { focus: 1 };

/** What a channel's mass measures out to. The golden tier reads this and no more. */
export interface TracerReading {
	x: number;
	y: number;
	z: number;
	/** Farthest a live tracer stands from the seal origin. */
	reach: number;
	/** Mean speed of the live tracers, seal units per second. */
	speed: number;
}

/** The digest a cast baseline quantizes a population into. */
export interface TracerDigest {
	live: number;
	born: number;
	pooled: number;
	/** Fade-weighted mass in four height bands over the seal. */
	bands: [number, number, number, number];
	/** Fade-weighted mass in three radial bands from the seal axis. */
	rings: [number, number, number];
	/** FNV-1a hash of the quantized fine occupancy grid, as 8 hex digits. */
	grid: string;
}

export class TracerPop {
	readonly pos: Float32Array;
	readonly vel: Float32Array;
	readonly alive: Uint8Array;
	readonly fade: Float32Array;
	readonly pooled: Uint8Array;
	readonly capacity: number;
	readonly #age: Float32Array;
	readonly #life: Float32Array;
	readonly #spec: MotionSpec;
	readonly #seed: number;
	readonly #focus: number;
	readonly #hood: Neighbourhood;
	#rng: () => number;
	#carry = 0;
	#live = 0;
	#born = 0;
	#pooledCount = 0;

	constructor(
		element: VolumeElement,
		capacity: number,
		seed: number,
		physics: CastPhysics = UNFOCUSED
	) {
		this.#spec = MOTION[element];
		this.capacity = capacity;
		this.#seed = seed;
		this.#focus = Math.max(1, physics.focus);
		this.#rng = mulberry32(seed);
		this.pos = new Float32Array(capacity * 3);
		this.vel = new Float32Array(capacity * 3);
		this.alive = new Uint8Array(capacity);
		this.fade = new Float32Array(capacity);
		this.pooled = new Uint8Array(capacity);
		this.#age = new Float32Array(capacity);
		this.#life = new Float32Array(capacity);
		this.#hood = new Neighbourhood(capacity);
	}

	get live(): number {
		return this.#live;
	}

	get born(): number {
		return this.#born;
	}

	/** Fraction of the live population settled, on the paper or set in the air. */
	get pooledFraction(): number {
		return this.#live === 0 ? 0 : this.#pooledCount / this.#live;
	}

	/** Live tracers on or near the paper, fade-weighted. The ground wash's gauge. */
	groundMass(): number {
		let mass = 0;
		for (let i = 0; i < this.capacity; i += 1) {
			if (!this.alive[i]) continue;
			if (this.pooled[i]) {
				mass += 1;
			} else if (this.pos[i * 3 + 2] < WASH_GAUGE.nearZ) {
				mass += this.fade[i];
			}
		}
		return mass;
	}

	/** What purchase a levitation pair gets on this element (ground truth section 6). */
	get grip(): number {
		return this.#spec.grip;
	}

	reset(): void {
		this.alive.fill(0);
		this.pooled.fill(0);
		this.fade.fill(0);
		this.#hood.clear();
		this.#carry = 0;
		this.#live = 0;
		this.#born = 0;
		this.#pooledCount = 0;
		this.#rng = mulberry32(this.#seed);
	}

	/** One fixed step of spawn, forces, integration and ageing. */
	step(flow: TrackFlow, tMs: number): void {
		const spec = this.#spec;
		const dt = STEP_S;
		const t = tMs / 1000;
		// The turbulence impulse lands on one step in three at three times the
		// gain, so the time average is unchanged and curl is a third of the cost.
		// The neighbourhood rides the same stride at the same gain.
		const stepIndex = Math.round(tMs / (STEP_S * 1000));
		const strided = stepIndex % TURBULENCE_STRIDE === 0;
		const turbGain = strided ? TURBULENCE_STRIDE : 0;
		this.#spawn(flow, tMs);
		if (strided) {
			this.#hood.refresh(this.pos, this.vel, this.fade, this.alive, this.pooled, this.#focus);
		}

		const reach = Math.max(0.05, flow.reach);
		const pool = spec.pool;
		// The levitation pair only acts where a gather is (ground truth section
		// 6), and what it can take is the element's own grip: a streaming element
		// keeps its whole weight there and is contained only across the axis, so
		// it washes through the grip instead of hanging in it.
		const grip = flow.gather > 0 ? spec.grip : 1;
		const weightMul = flow.weightMul + (1 - flow.weightMul) * (1 - grip);
		const rigidity = RIGIDITY_PER_FOCUS * (this.#focus - 1);
		let live = 0;
		let pooledCount = 0;
		for (let i = 0; i < this.capacity; i += 1) {
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
			// Height along the flow's own axis, as a fraction of its reach.
			const ox = px - flow.originX;
			const oy = py - flow.originY;
			const oz = pz - flow.originZ;
			const along = ox * flow.axisX + oy * flow.axisY + oz * flow.axisZ;
			const hn = Math.min(1.6, Math.max(0, along / reach));
			// In-plane frame about the origin, for the swirl and the ring terms.
			const rx = px - flow.originX;
			const ry = py - flow.originY;
			const radius = Math.hypot(rx, ry);
			const outx = radius > 1e-4 ? rx / radius : 0;
			const outy = radius > 1e-4 ? ry / radius : 0;

			if (this.pooled[i] === FROZEN) {
				// Lattice. Nothing moves it until the afterglow drains it.
				vx = 0;
				vy = 0;
				vz = 0;
			} else if (this.pooled[i]) {
				// The settled mass: water's puddle spreads, earth's mound holds.
				// The spread runs out at the pool's edge, or a long fed cast
				// grows its puddle to the grid walls and the skin clips it flat.
				const room = smooth01((pool!.edge - radius) / 0.35);
				vx += outx * pool!.spread * room * dt;
				vy += outy * pool!.spread * room * dt;
				// The kind's inward sink holds the settled mass too, at half
				// strength: what a pull grasps stays a cushion at its mouth and
				// a whirl's foot gathers on its wall (section 7), instead of the
				// puddle running out from under either.
				if (flow.sink > 0) {
					const toRing = flow.pool - radius;
					vx += outx * flow.sink * 0.5 * toRing * dt;
					vy += outy * flow.sink * 0.5 * toRing * dt;
				}
				const keep = Math.exp(-pool!.dragXY * dt);
				vx *= keep;
				vy *= keep;
				vz = 0;
			} else {
				// The element's own physics.
				const lift = spec.buoyancy * weightMul * Math.pow(heat, 1.15) * dt;
				vx += flow.axisX * lift;
				vy += flow.axisY * lift;
				vz += flow.axisZ * lift;
				vz -= spec.gravity * weightMul * dt;
				const pinch = spec.pinch * flow.pinchMul;
				if (pinch > 0) {
					const boundary = boundaryAt(flow, px, py, hn, t);
					const off = radius - boundary;
					if (off > 0) {
						vx -= outx * pinch * off * dt;
						vy -= outy * pinch * off * dt;
					}
				}
				if (turbGain > 0) {
					const scale = spec.turbScale * flow.turbScaleMul;
					curl(px * scale, py * scale, pz * scale - t * 0.7, scratch);
					const gain =
						spec.turbulence *
						flow.turbMul *
						turbGain *
						(0.48 + 1.4 * smooth01(hn / 0.55) + 0.55 * flow.punch) *
						(0.5 + 0.7 * t01);
					vx += scratch.x * gain * dt;
					vy += scratch.y * gain * dt;
					vz += scratch.z * gain * 0.7 * dt;
				}
				if (spec.gust > 0 && flow.gustMul > 0) {
					const gust = spec.gust * flow.gustMul;
					vx += gust * Math.sin(t * 1.35 + pz * 1.1 + i * 0.013) * dt;
					vy += gust * 0.55 * Math.cos(t * 0.9 + pz * 0.8 + i * 0.007) * dt;
				}
				const swirl = spec.swirl + flow.swirl;
				vx += -outy * swirl * radius * dt;
				vy += outx * swirl * radius * dt;
				// The arm herding: matter is drawn tangentially toward the nearest
				// of the flow's standing arms, and the cell turns the pattern with
				// the same phase the mass moves by. Without it a swirl is an
				// axisymmetric field, and the skin of one shows no rotation at all.
				if (flow.arms > 0 && flow.armGain > 0 && radius > 0.02) {
					const rel = flow.arms * (Math.atan2(ry, rx) - flow.armPhase - flow.armPitch * hn);
					const herd = -flow.armGain * Math.sin(rel);
					vx += -outy * herd * dt;
					vy += outx * herd * dt;
				}
				// The kind's ring term. Positive is the signed ring attractor: matter
				// gathers at `pool` and is pushed back out of the exact center, which
				// is what keeps an eye hollow. Negative is a plain outward push.
				if (flow.sink > 0) {
					const toRing = flow.pool - radius;
					vx += outx * flow.sink * toRing * dt;
					vy += outy * flow.sink * toRing * dt;
				} else if (flow.sink < 0) {
					vx += outx * -flow.sink * dt;
					vy += outy * -flow.sink * dt;
				}
				if (flow.gather > 0) {
					// Section 6's grip is the element's. A gripped element is drawn
					// back onto the locus from every side; a streaming one only
					// onto the axis, so it passes through the pair as a wash.
					if (grip > 0) {
						const dist = Math.hypot(ox, oy, oz);
						const past = dist - flow.holdRadius;
						if (past > 0 && dist > 1e-4) {
							const pull = (grip * flow.gather * past * dt) / dist;
							vx -= ox * pull;
							vy -= oy * pull;
							vz -= oz * pull;
						}
					}
					if (grip < 1) {
						const across = Math.hypot(ox, oy);
						const wide = across - flow.holdRadius;
						if (wide > 0 && across > 1e-4) {
							const pull = ((1 - grip) * flow.gather * wide * dt) / across;
							vx -= ox * pull;
							vy -= oy * pull;
						}
					}
				}
				if (flow.ceiling > 0 && pz > flow.ceiling) {
					vz -= (pz - flow.ceiling) * 6 * dt;
				}
				vx += flow.driftX * dt;
				vy += flow.driftY * dt;
				if (strided) {
					// Section 8: the crowd's push back, and the rigidity of focused
					// magic, which pulls each tracer toward its neighbours' motion.
					const hood = this.#hood;
					vx += hood.push[i * 3] * turbGain * dt;
					vy += hood.push[i * 3 + 1] * turbGain * dt;
					vz += hood.push[i * 3 + 2] * turbGain * dt;
					if (rigidity > 0 && hood.crowd[i] > 0) {
						const k = Math.min(1, rigidity * turbGain * dt);
						vx += (hood.mean[i * 3] - vx) * k;
						vy += (hood.mean[i * 3 + 1] - vy) * k;
						vz += (hood.mean[i * 3 + 2] - vz) * k;
					}
				}
				const keep = Math.exp(-spec.drag * dt);
				vx *= keep;
				vy *= keep;
				vz *= keep;
			}

			const nx = px + vx * dt;
			const ny = py + vy * dt;
			let nz = pz + vz * dt;

			// The floor, for the rows whose matter stays: land, lose most of the
			// impact, then settle into the pool or the mound.
			if (pool && !this.pooled[i] && nz <= pool.floorZ && vz < 0) {
				nz = pool.floorZ;
				vz = -vz * pool.bounce;
				if (vz < 0.16) {
					this.pooled[i] = LANDED;
					vz = 0;
				}
			}
			// Where growth stops it sets: matter slower than its row's settle
			// speed, once clear of the mouth, is lattice from here on.
			if (
				pool &&
				!this.pooled[i] &&
				pool.settleSpeed > 0 &&
				this.#age[i] > SETTLE_AFTER_S &&
				vx * vx + vy * vy + vz * vz < pool.settleSpeed * pool.settleSpeed
			) {
				this.pooled[i] = FROZEN;
				vx = 0;
				vy = 0;
				vz = 0;
			}
			// The heap: a landed tracer stands its row's thickness above the
			// floor where the settled crowd is dense, so a mound has height and
			// a puddle has next to none.
			if (this.pooled[i] === LANDED && pool!.heap > 0) {
				const target = pool!.floorZ + pool!.heap * Math.min(1, this.#hood.crowd[i] / HEAP.crowd);
				nz += (target - nz) * Math.min(1, HEAP_RATE * dt);
			}

			let ageRate = 1;
			if (this.pooled[i]) {
				ageRate = pool!.ageRate + pool!.drainAgeRate * flow.drain;
			} else if (hn > spec.tearFrom) {
				ageRate = spec.tearRate;
			}
			this.#age[i] += dt * flow.burn * ageRate;

			const dead =
				this.#age[i] >= life ||
				along > spec.heightCap * reach ||
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
			// The ramp-in is capped by the tracer's own life, or a short-fused punch
			// parcel would spend its whole life under the chip cutoff and the strike
			// would render as a pile of separate grid-sized chips.
			let fade = Math.min(this.#age[i] / Math.min(0.25, life * 0.35), 1) * (1 - t01);
			// Above the tear line a tip melts as it rises, so the crown thins to
			// nothing rather than freezing into stray grid-sized chips. The melt is
			// steep on purpose: a gentle one parks deposits exactly at the chip
			// cutoff, which is the borderline the flakes came from.
			if (spec.tearFrom < 2) {
				fade *= 1 - 0.97 * smooth01((hn - spec.tearFrom) / 0.42);
			}
			this.fade[i] = fade;
			live += 1;
			if (this.pooled[i]) pooledCount += 1;
		}
		this.#live = live;
		this.#pooledCount = pooledCount;
	}

	#spawn(flow: TrackFlow, tMs: number): void {
		const spec = this.#spec;
		const rng = this.#rng;
		const rate = spec.spawnPerSec * flow.emission * (1 + 2.4 * flow.punch);
		this.#carry += rate * STEP_S;
		let births = Math.floor(this.#carry);
		this.#carry -= births;
		let cursor = 0;
		while (births-- > 0) {
			while (cursor < this.capacity && this.alive[cursor]) cursor += 1;
			if (cursor >= this.capacity) break;
			const i = cursor;
			spawnAt(flow, spec, rng, tMs, site);
			this.alive[i] = 1;
			this.pooled[i] = 0;
			this.#age[i] = 0;
			this.#life[i] = (spec.lifeLo + rng() * (spec.lifeHi - spec.lifeLo)) * site.life;
			this.pos[i * 3] = site.x;
			this.pos[i * 3 + 1] = site.y;
			this.pos[i * 3 + 2] = site.z;
			this.vel[i * 3] = site.vx;
			this.vel[i * 3 + 1] = site.vy;
			this.vel[i * 3 + 2] = site.vz;
			this.fade[i] = 0;
			this.#hood.forget(i);
			this.#born += 1;
		}
	}

	/** Where this population's mass stands, fade-weighted. */
	measure(out: TracerReading): void {
		let mass = 0;
		let cx = 0;
		let cy = 0;
		let cz = 0;
		let reach = 0;
		let speed = 0;
		let count = 0;
		for (let i = 0; i < this.capacity; i += 1) {
			if (!this.alive[i]) continue;
			const w = this.fade[i];
			const x = this.pos[i * 3];
			const y = this.pos[i * 3 + 1];
			const z = this.pos[i * 3 + 2];
			mass += w;
			cx += x * w;
			cy += y * w;
			cz += z * w;
			const r = Math.hypot(x, y, z);
			if (r > reach) reach = r;
			speed += Math.hypot(this.vel[i * 3], this.vel[i * 3 + 1], this.vel[i * 3 + 2]);
			count += 1;
		}
		if (mass > 1e-6) {
			out.x = cx / mass;
			out.y = cy / mass;
			out.z = cz / mass;
		} else {
			out.x = 0;
			out.y = 0;
			out.z = 0;
		}
		out.reach = reach;
		out.speed = count > 0 ? speed / count : 0;
	}

	/**
	 * The population quantized for a text baseline: band masses a reviewer can
	 * read, and a hash of the fine occupancy grid a tuning drift cannot dodge.
	 * Everything is quantized before it is printed or hashed, so float dust in
	 * the last bits cannot rewrite a golden.
	 */
	digest(): TracerDigest {
		const bands: [number, number, number, number] = [0, 0, 0, 0];
		const rings: [number, number, number] = [0, 0, 0];
		// 6 x 6 x 4 cells over x,y in [-1.65, 1.65] and z in [0, 2.2].
		const grid = new Float32Array(6 * 6 * 4);
		for (let i = 0; i < this.capacity; i += 1) {
			if (!this.alive[i]) continue;
			const w = this.fade[i];
			const x = this.pos[i * 3];
			const y = this.pos[i * 3 + 1];
			const z = this.pos[i * 3 + 2];
			const band = Math.min(3, Math.max(0, Math.floor(z / 0.55)));
			bands[band] += w;
			const r = Math.hypot(x, y);
			rings[r < 0.5 ? 0 : r < 1 ? 1 : 2] += w;
			const gx = Math.min(5, Math.max(0, Math.floor(((x + 1.65) / 3.3) * 6)));
			const gy = Math.min(5, Math.max(0, Math.floor(((y + 1.65) / 3.3) * 6)));
			const gz = Math.min(3, Math.max(0, Math.floor((z / 2.2) * 4)));
			grid[(gz * 6 + gy) * 6 + gx] += w;
		}
		let hash = 0x811c9dc5;
		for (let c = 0; c < grid.length; c += 1) {
			// Half-unit mass buckets: coarse enough to survive float dust, fine
			// enough that a moved population cannot keep its hash.
			hash ^= Math.round(grid[c] * 2) & 0xff;
			hash = Math.imul(hash, 0x01000193);
		}
		const quantize = (v: number) => Math.round(v * 10) / 10;
		return {
			live: this.#live,
			born: this.#born,
			pooled: this.#pooledCount,
			bands: [quantize(bands[0]), quantize(bands[1]), quantize(bands[2]), quantize(bands[3])],
			rings: [quantize(rings[0]), quantize(rings[1]), quantize(rings[2])],
			grid: (hash >>> 0).toString(16).padStart(8, '0')
		};
	}
}
