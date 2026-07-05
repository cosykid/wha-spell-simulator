/**
 * Node-side harness: deterministic particle traces through the real field —
 * same spawn law, integration and kill rules as render/particles.ts, minus
 * the DOM/three renderer — plus probe helpers the checks are written against.
 */
import * as THREE from 'three';
import { CONFIG } from '../src/config';
import { sampleAmbientVelocity, sampleVelocity } from '../src/field';
import { maskAt, spawnWeight, type Nozzle } from '../src/nozzle';
import { AmbientMedium } from '../src/render/ambient';
import { v2 } from '../src/math2';

export interface TracePoint {
	x: number;
	y: number;
	z: number;
	fade: number; // same age envelope the sim uses for particle brightness
}

import { mulberry32 } from '../src/math2';
export { mulberry32 };

const DT = 1 / 60;

/** Integrate `count` tracers from spawn to death. Returns one path each. */
export function trace(n: Nozzle, count = 500, seed = 1): TracePoint[][] {
	if (!n.manifests) return []; // §7: pull-only seals spawn no own magic
	const rand = mulberry32(seed);
	const pos = new THREE.Vector3();
	const vel = new THREE.Vector3();
	const paths: TracePoint[][] = [];
	let tries = count * 600; // rejection-sampling budget (center pin is tiny)

	while (paths.length < count && tries-- > 0) {
		const r = 1.32 * Math.sqrt(rand());
		const th = rand() * 2 * Math.PI;
		const sx = r * Math.cos(th);
		const sz = r * Math.sin(th);
		if (rand() >= spawnWeight(n, v2(sx, sz))) continue;

		pos.set(sx, 0.02 + rand() * 0.03, sz);
		const life = CONFIG.LIFE_MIN + rand() * (CONFIG.LIFE_MAX - CONFIG.LIFE_MIN);
		const path: TracePoint[] = [];
		// held tracers stop aging (HOLD_AGE 0), so cap the walltime: a captured
		// path is truncated after 30 sim-seconds of churn. Note the capacity
		// throttle is a *population* effect — single-path traces don't see it;
		// the waterball check runs the real Particles class for that claim.
		let age = 0;
		for (let step = 0; step < 1800 && age < life; step++) {
			const mask = sampleVelocity(n, pos, vel);
			const fade = Math.min(age / 0.25, 1) * (1 - age / life);
			path.push({ x: pos.x, y: pos.y, z: pos.z, fade });
			pos.addScaledVector(vel, DT);
			const rho = Math.hypot(pos.x, pos.z);
			if (rho < 1 && pos.y < 0.015) pos.y = 0.015;
			if (pos.length() > CONFIG.KILL_DIST || (mask < CONFIG.KILL_MASK && age > 0.4)) break;
			// same held-age rule as render/particles.ts: churning tracers persist
			let rate = 1;
			const lv = n.lev;
			if (lv?.grip && lv.C > 0) {
				const d = Math.hypot(pos.x - lv.x0.x, pos.y - lv.h0, pos.z - lv.x0.y);
				if (d < CONFIG.BLOB_R + CONFIG.BLOB_SOFT) rate = CONFIG.HOLD_AGE;
			}
			age += DT * rate;
		}
		paths.push(path);
	}
	return paths;
}

/**
 * Trace the ambient medium (§7): motes seeded uniformly through the domain,
 * advected by u_amb at full throttle. Single-path traces don't see the
 * capacitor (a population effect — the grasping-wind check runs the real
 * AmbientMedium class for that claim); these paths are for the PNGs and the
 * qualitative flow-shape checks.
 */
export function traceAmbient(n: Nozzle, count = 350, seed = 1, seconds = 14): TracePoint[][] {
	const rand = mulberry32(seed);
	const pos = new THREE.Vector3();
	const vel = new THREE.Vector3();
	const paths: TracePoint[][] = [];
	const steps = Math.round(seconds / DT);
	for (let i = 0; i < count; i++) {
		const r = CONFIG.AMBIENT_R * Math.sqrt(rand());
		const th = rand() * 2 * Math.PI;
		pos.set(r * Math.cos(th), 0.05 + rand() * CONFIG.AMBIENT_H, r * Math.sin(th));
		const path: TracePoint[] = [];
		for (let step = 0; step < steps; step++) {
			if (step % 3 === 0) path.push({ x: pos.x, y: pos.y, z: pos.z, fade: 1 });
			sampleAmbientVelocity(n, pos, vel);
			pos.addScaledVector(vel, DT);
			const rho = Math.hypot(pos.x, pos.z);
			if (rho < 1 && pos.y < 0.015) pos.y = 0.015;
		}
		paths.push(path);
	}
	return paths;
}

/**
 * Run the real AmbientMedium population under a vessel (§9): the pour, the
 * one-way shell and the excluded-volume pooling are population effects that
 * single-path traces cannot see. Returns short trails from the last few
 * seconds, so the pooled cup shows as a dense cluster in the PNGs.
 */
export function traceVesselPopulation(
	n: Nozzle,
	pour: boolean,
	seconds = 30,
	seed = 5
): TracePoint[][] {
	const med = new AmbientMedium(new THREE.Scene());
	med.setSeal(n, 0xffffff, seed, pour);
	const tail = 3;
	for (let s = 0; s < Math.round((seconds - tail) / DT); s++) med.update(DT);
	const paths: TracePoint[][] = [];
	const trail = new Map<number, TracePoint[]>();
	const max = med.pos.length / 3;
	for (let s = 0; s < Math.round(tail / DT); s++) {
		med.update(DT);
		if (s % 6 !== 0) continue;
		for (let i = 0; i < max; i++) {
			const x = med.pos[i * 3];
			if (x < -900) continue; // parked pour motes
			let t = trail.get(i);
			if (!t) {
				t = [];
				trail.set(i, t);
				paths.push(t);
			}
			t.push({ x, y: med.pos[i * 3 + 1], z: med.pos[i * 3 + 2], fade: 1 });
		}
	}
	return paths;
}

export interface Vec3Like {
	x: number;
	y: number;
	z: number;
}

/** Everything a preset check gets to look at. */
export interface Ctx {
	n: Nozzle;
	traces: TracePoint[][];
	u(x: number, y: number, z: number): Vec3Like;
	uAmb(x: number, y: number, z: number): Vec3Like;
	mask(x: number, z: number): number;
	spawn(x: number, z: number): number;
	expect(cond: boolean, msg: string): void;
	failures: string[];
}

export function makeCtx(n: Nozzle, traces: TracePoint[][]): Ctx {
	const out = new THREE.Vector3();
	const p = new THREE.Vector3();
	const failures: string[] = [];
	return {
		n,
		traces,
		u: (x, y, z) => {
			sampleVelocity(n, p.set(x, y, z), out);
			return { x: out.x, y: out.y, z: out.z };
		},
		uAmb: (x, y, z) => {
			sampleAmbientVelocity(n, p.set(x, y, z), out);
			return { x: out.x, y: out.y, z: out.z };
		},
		mask: (x, z) => maskAt(n, v2(x, z)),
		spawn: (x, z) => spawnWeight(n, v2(x, z)),
		expect: (cond, msg) => {
			if (!cond) failures.push(msg);
		},
		failures
	};
}

/** Format a number for check messages. */
export const f = (x: number): string => x.toFixed(2);
