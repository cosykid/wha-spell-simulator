/**
 * @file Which tracers crowd which: the neighbourhood a population reads on the
 * turbulence stride. It is rebuilt from the arrays every time through one
 * hashed grid, so the two population-wide mechanics of ground truth section 8
 * that read it (the excluded volume and the rigidity of focused magic) and the
 * heap's crowding stay pure functions of the state, like every other force.
 *
 * Same state only: an airborne tracer collects the push of every airborne
 * neighbour inside the excluded radius and their mean velocity, a landed one
 * only counts its landed neighbours inside the heap's radius, and set lattice
 * takes part in nothing. A puddle never shoves the rain landing on it.
 *
 * A neighbour pushes with its fade, not its presence: a tracer melting at a
 * crown or a short-fused strike parcel has little matter to take room with,
 * so a thin crown is never sprayed apart by the push that fills a ball.
 */

import { EXCLUDED, HEAP } from './tuning.js';

/** A tracer's settled state. Zero is airborne. */
export const LANDED = 1;
/** Set in the air where it stopped: crystal's lattice. It neither spreads nor heaps. */
export const FROZEN = 2;

/** Buckets in the hash. A collision only adds candidates the distance test rejects. */
const GRID_BUCKETS = 8192;
const NO_TRACER = -1;

function bucketOf(ix: number, iy: number, iz: number): number {
	const h = Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663) ^ Math.imul(iz, 83492791);
	return (h >>> 0) & (GRID_BUCKETS - 1);
}

export class Neighbourhood {
	/** The crowd's push on each airborne tracer, seal units per second squared. */
	readonly push: Float32Array;
	/** The mean velocity of each airborne tracer's neighbours. */
	readonly mean: Float32Array;
	/** How many neighbours in its own state each tracer has. */
	readonly crowd: Uint16Array;
	readonly #head = new Int32Array(GRID_BUCKETS);
	readonly #next: Int32Array;

	constructor(capacity: number) {
		this.push = new Float32Array(capacity * 3);
		this.mean = new Float32Array(capacity * 3);
		this.crowd = new Uint16Array(capacity);
		this.#next = new Int32Array(capacity);
	}

	clear(): void {
		this.push.fill(0);
		this.mean.fill(0);
		this.crowd.fill(0);
	}

	/** A slot reused by a birth starts with no neighbours until the next refresh. */
	forget(i: number): void {
		this.push[i * 3] = 0;
		this.push[i * 3 + 1] = 0;
		this.push[i * 3 + 2] = 0;
		this.mean[i * 3] = 0;
		this.mean[i * 3 + 1] = 0;
		this.mean[i * 3 + 2] = 0;
		this.crowd[i] = 0;
	}

	refresh(
		pos: Float32Array,
		vel: Float32Array,
		fade: Float32Array,
		alive: Uint8Array,
		pooled: Uint8Array,
		focus: number
	): void {
		const head = this.#head;
		const next = this.#next;
		const capacity = alive.length;
		const inv = 1 / EXCLUDED.cell;
		head.fill(NO_TRACER);
		for (let i = 0; i < capacity; i += 1) {
			if (!alive[i] || pooled[i] === FROZEN) continue;
			const key = bucketOf(
				Math.floor(pos[i * 3] * inv),
				Math.floor(pos[i * 3 + 1] * inv),
				Math.floor(pos[i * 3 + 2] * inv)
			);
			next[i] = head[key];
			head[key] = i;
		}
		// Focus packs against the excluded volume by shrinking it, never by
		// removing it: section 8 raises density toward the incompressible limit.
		const airRadius = EXCLUDED.radius / Math.cbrt(Math.max(1, focus));
		const airRadius2 = airRadius * airRadius;
		const heapRadius2 = HEAP.radius * HEAP.radius;
		const capPush = EXCLUDED.strength * EXCLUDED.cap;
		for (let i = 0; i < capacity; i += 1) {
			if (!alive[i]) continue;
			let px = 0;
			let py = 0;
			let pz = 0;
			let mx = 0;
			let my = 0;
			let mz = 0;
			let mass = 0;
			let crowd = 0;
			if (pooled[i] !== FROZEN) {
				const settled = pooled[i] !== 0;
				const r2 = settled ? heapRadius2 : airRadius2;
				const x = pos[i * 3];
				const y = pos[i * 3 + 1];
				const z = pos[i * 3 + 2];
				const cx = Math.floor(x * inv);
				const cy = Math.floor(y * inv);
				const cz = Math.floor(z * inv);
				for (let dz = -1; dz <= 1; dz += 1) {
					for (let dy = -1; dy <= 1; dy += 1) {
						for (let dx = -1; dx <= 1; dx += 1) {
							let j = head[bucketOf(cx + dx, cy + dy, cz + dz)];
							while (j !== NO_TRACER) {
								if (j !== i && (pooled[j] !== 0) === settled) {
									const ox = x - pos[j * 3];
									const oy = y - pos[j * 3 + 1];
									const oz = z - pos[j * 3 + 2];
									const d2 = ox * ox + oy * oy + oz * oz;
									if (d2 < r2) {
										crowd += 1;
										if (!settled) {
											const w = fade[j];
											if (d2 > 1e-8) {
												const d = Math.sqrt(d2);
												const s = (w * EXCLUDED.strength * (1 - d / airRadius)) / d;
												px += ox * s;
												py += oy * s;
												pz += oz * s;
											}
											mx += vel[j * 3] * w;
											my += vel[j * 3 + 1] * w;
											mz += vel[j * 3 + 2] * w;
											mass += w;
										}
									}
								}
								j = next[j];
							}
						}
					}
				}
				// However dense the crowd, its push saturates.
				const magnitude = Math.hypot(px, py, pz);
				if (magnitude > capPush) {
					const k = capPush / magnitude;
					px *= k;
					py *= k;
					pz *= k;
				}
				if (mass > 1e-6) {
					mx /= mass;
					my /= mass;
					mz /= mass;
				}
			}
			this.push[i * 3] = px;
			this.push[i * 3 + 1] = py;
			this.push[i * 3 + 2] = pz;
			this.mean[i * 3] = mx;
			this.mean[i * 3 + 1] = my;
			this.mean[i * 3 + 2] = mz;
			this.crowd[i] = Math.min(65535, crowd);
		}
	}
}
