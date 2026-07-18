/**
 * §8/§9 population mechanics — excluded volume (every seal), rigidity (∝ Q)
 * and the orb vessel. These live in transport, not the field: single-path
 * traces cannot see them (same caveat as the §6/§7 capacities).
 *
 * - Excluded volume: manifested magic occupies space. Tracers repel inside
 *   VOL_RADIUS (a soft density pressure), so packing can never collapse to a
 *   point and a held ball keeps the size its content dictates.
 * - Rigidity: with a lens on the seal (Q > 0), tracer velocities relax toward
 *   the local neighbourhood mean — the packed blob moves as one body.
 * - Vessel (§9, population-blind): inside the shell every E-matter tracer
 *   feels the settle velocity (gravity is local law) and the captured stir;
 *   at the boundary the outward normal component is clipped — one-way in.
 */
import { CONFIG } from './config.js';
import type { OrbBundle } from './nozzle.js';

const CELL = CONFIG.VOL_RADIUS;
const KEY_OFF = 256; // grid spans ±256 cells ≈ ±11.5 world units (> KILL_DIST)

export class PopulationMechanics {
	private readonly grid = new Map<number, number[]>();
	private readonly dvx: Float32Array;
	private readonly dvy: Float32Array;
	private readonly dvz: Float32Array;

	constructor(max: number) {
		this.dvx = new Float32Array(max);
		this.dvy = new Float32Array(max);
		this.dvz = new Float32Array(max);
	}

	/** Velocity-level corrections, applied after the field pass, before integration. */
	apply(
		pos: Float32Array,
		vel: Float32Array,
		alive: Uint8Array,
		max: number,
		Q: number,
		dt: number
	): void {
		const grid = this.grid;
		grid.clear();
		let any = false;
		for (let i = 0; i < max; i++) {
			if (!alive[i]) continue;
			any = true;
			const key = cellKey(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
			const cell = grid.get(key);
			if (cell) cell.push(i);
			else grid.set(key, [i]);
		}
		if (!any) return;

		const rigid = Q > 1e-3 ? Math.min(1, CONFIG.RIGID_RATE * Q * dt) : 0;

		for (let i = 0; i < max; i++) {
			if (!alive[i]) continue;
			const xi = pos[i * 3];
			const yi = pos[i * 3 + 1];
			const zi = pos[i * 3 + 2];
			const cx = Math.floor(xi / CELL);
			const cy = Math.floor(yi / CELL);
			const cz = Math.floor(zi / CELL);
			let px = 0; // summed repulsion
			let py = 0;
			let pz = 0;
			let mvx = 0; // neighbourhood velocity sums (rigidity)
			let mvy = 0;
			let mvz = 0;
			let cnt = 0;
			for (let ox = -1; ox <= 1; ox++)
				for (let oy = -1; oy <= 1; oy++)
					for (let oz = -1; oz <= 1; oz++) {
						const cell = grid.get(
							((cx + ox + KEY_OFF) | ((cy + oy + KEY_OFF) << 9) | ((cz + oz + KEY_OFF) << 18)) >>> 0
						);
						if (!cell) continue;
						for (const j of cell) {
							mvx += vel[j * 3];
							mvy += vel[j * 3 + 1];
							mvz += vel[j * 3 + 2];
							cnt++;
							if (j === i) continue;
							const dx = xi - pos[j * 3];
							const dy = yi - pos[j * 3 + 1];
							const dz = zi - pos[j * 3 + 2];
							const d = Math.hypot(dx, dy, dz);
							if (d >= CONFIG.VOL_RADIUS) continue;
							const push = CONFIG.VOL_PUSH * (1 - d / CONFIG.VOL_RADIUS);
							if (d > 1e-5) {
								px += (dx / d) * push;
								py += (dy / d) * push;
								pz += (dz / d) * push;
							} else {
								// co-located: break the tie deterministically
								px += (i > j ? 1 : -1) * push;
							}
						}
					}
			const pmag = Math.hypot(px, py, pz);
			if (pmag > CONFIG.VOL_PUSH_MAX) {
				const s = CONFIG.VOL_PUSH_MAX / pmag;
				px *= s;
				py *= s;
				pz *= s;
			}
			this.dvx[i] = px;
			this.dvy[i] = py;
			this.dvz[i] = pz;
			// rigidity: relax toward the local mean (computed from PRE-blend
			// velocities, so the result is order-independent)
			if (rigid > 0 && cnt >= CONFIG.RIGID_MIN_N) {
				this.dvx[i] += rigid * (mvx / cnt - vel[i * 3]);
				this.dvy[i] += rigid * (mvy / cnt - vel[i * 3 + 1]);
				this.dvz[i] += rigid * (mvz / cnt - vel[i * 3 + 2]);
			}
		}

		for (let i = 0; i < max; i++) {
			if (!alive[i]) continue;
			vel[i * 3] += this.dvx[i];
			vel[i * 3 + 1] += this.dvy[i];
			vel[i * 3 + 2] += this.dvz[i];
		}
	}
}

function cellKey(x: number, y: number, z: number): number {
	return (
		((Math.floor(x / CELL) + KEY_OFF) |
			((Math.floor(y / CELL) + KEY_OFF) << 9) |
			((Math.floor(z / CELL) + KEY_OFF) << 18)) >>>
		0
	);
}

/** Is the point inside the vessel shell? (§9 containment is pure geometry.) */
export function vesselContains(orb: OrbBundle, x: number, y: number, z: number): boolean {
	const dx = x - orb.x.x;
	const dy = y - orb.h;
	const dz = z - orb.x.y;
	return dx * dx + dy * dy + dz * dz < orb.radius * orb.radius;
}

/**
 * §9 vessel pass for one tracer (stride-3 arrays): settle + stir inside the
 * shell, one-way clip at the boundary. Applied AFTER the field and §8
 * mechanics passes, so nothing — not even excluded-volume pressure — can
 * shove contained matter through the shell. Returns true if contained.
 */
export function vesselPass(
	orb: OrbBundle,
	pos: Float32Array,
	vel: Float32Array,
	i: number
): boolean {
	const dx = pos[i * 3] - orb.x.x;
	const dy = pos[i * 3 + 1] - orb.h;
	const dz = pos[i * 3 + 2] - orb.x.y;
	const d = Math.hypot(dx, dy, dz);
	if (d >= orb.radius) return false;
	// gravity is local law (§9 ruling 4): contained matter settles…
	vel[i * 3 + 1] -= CONFIG.ORB_SETTLE;
	// …and the captured Γ stirs it: solid-body swirl about the vessel axis
	if (Math.abs(orb.stir) > 1e-3) {
		const w = CONFIG.ORB_STIR * orb.stir;
		vel[i * 3] += -dz * w;
		vel[i * 3 + 2] += dx * w;
	}
	// one-way shell: in the boundary band, remove the outward normal component
	if (d > orb.radius - CONFIG.ORB_WALL && d > 1e-6) {
		const nx = dx / d;
		const ny = dy / d;
		const nz = dz / d;
		const c = vel[i * 3] * nx + vel[i * 3 + 1] * ny + vel[i * 3 + 2] * nz;
		if (c > 0) {
			vel[i * 3] -= c * nx;
			vel[i * 3 + 1] -= c * ny;
			vel[i * 3 + 2] -= c * nz;
		}
	}
	return true;
}

/**
 * Belt and braces after integration: a step that still jumped the shell
 * (summed pushes can exceed the clip band in one frame) is projected back
 * onto it. Call only for tracers that were contained before the step.
 */
export function vesselClamp(orb: OrbBundle, p: { x: number; y: number; z: number }): void {
	const dx = p.x - orb.x.x;
	const dy = p.y - orb.h;
	const dz = p.z - orb.x.y;
	const d = Math.hypot(dx, dy, dz);
	if (d <= orb.radius || d < 1e-6) return;
	const s = (orb.radius - 1e-3) / d;
	p.x = orb.x.x + dx * s;
	p.y = orb.h + dy * s;
	p.z = orb.x.y + dz * s;
}
