/**
 * @file The one flow both populations ride, on the CPU.
 *
 * This is a line-for-line mirror of the force block in `sim.glsl.ts`: the same
 * hash, the same value noise, the same curl, and the same buoyancy / pinch /
 * swirl / turbulence terms reading the same {@link FLOW} constants the shader
 * gets as uniforms. A brush mark integrating {@link flowAccel} therefore travels
 * the streamline a GPU parcel next to it travels, which is what stops the licks
 * reading as a second effect laid over the first.
 *
 * It also owns the two questions only the brush asks: where the mass's edge is
 * ({@link boundaryRadius} — literally the surface the shader pinches toward) and
 * how much mass covers a point ({@link massDensity}).
 */

import { FLOW } from './tuning.js';
import type { HybridSpell } from './hybridSpell.js';

/** A mutable seal-space vector, reused so a frame allocates nothing. */
export interface Vec3 {
	x: number;
	y: number;
	z: number;
}

function fract(value: number): number {
	return value - Math.floor(value);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
	const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

/** The shader's `hash13`, digit for digit. */
function hash13(x: number, y: number, z: number): number {
	let px = fract(x * 0.1031);
	let py = fract(y * 0.1031);
	let pz = fract(z * 0.1031);
	const d = px * (pz + 31.32) + py * (py + 31.32) + pz * (px + 31.32);
	px += d;
	py += d;
	pz += d;
	return fract((px + py) * pz);
}

/** The shader's `vnoise`: trilinear value noise on a quintic fade, in -1..1. */
function vnoise(x: number, y: number, z: number): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const iz = Math.floor(z);
	const fx = x - ix;
	const fy = y - iy;
	const fz = z - iz;
	const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
	const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
	const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
	const n000 = hash13(ix, iy, iz);
	const n100 = hash13(ix + 1, iy, iz);
	const n010 = hash13(ix, iy + 1, iz);
	const n110 = hash13(ix + 1, iy + 1, iz);
	const n001 = hash13(ix, iy, iz + 1);
	const n101 = hash13(ix + 1, iy, iz + 1);
	const n011 = hash13(ix, iy + 1, iz + 1);
	const n111 = hash13(ix + 1, iy + 1, iz + 1);
	const x00 = n000 + (n100 - n000) * ux;
	const x10 = n010 + (n110 - n010) * ux;
	const x01 = n001 + (n101 - n001) * ux;
	const x11 = n011 + (n111 - n011) * ux;
	const y0 = x00 + (x10 - x00) * uy;
	const y1 = x01 + (x11 - x01) * uy;
	return (y0 + (y1 - y0) * uz) * 2 - 1;
}

const EPS = 0.34;
const pot0: Vec3 = { x: 0, y: 0, z: 0 };
const potX: Vec3 = { x: 0, y: 0, z: 0 };
const potY: Vec3 = { x: 0, y: 0, z: 0 };
const potZ: Vec3 = { x: 0, y: 0, z: 0 };

function potential(out: Vec3, x: number, y: number, z: number): void {
	out.x = vnoise(x, y, z);
	out.y = vnoise(x + 41.7, y + 41.7, z + 41.7);
	out.z = vnoise(x - 27.3, y - 27.3, z - 27.3);
}

/** Curl of a noise potential: divergence free, so the flow folds instead of spraying. */
function curlNoise(out: Vec3, x: number, y: number, z: number, gain: number): void {
	potential(pot0, x, y, z);
	potential(potX, x + EPS, y, z);
	potential(potY, x, y + EPS, z);
	potential(potZ, x, y, z + EPS);
	out.x += (potY.z - pot0.z - (potZ.y - pot0.y)) * gain;
	out.y += (potZ.x - pot0.x - (potX.z - pot0.z)) * gain;
	out.z += (potX.y - pot0.y - (potY.x - pot0.x)) * gain;
}

/**
 * The radius the column is pinched to at this point: the shader's own `target`,
 * wander and all. This is the mass's edge, so it is where a lick belongs.
 */
export function boundaryRadius(spell: HybridSpell, angle: number, z: number, tSec: number): number {
	const hn = Math.min(1.6, Math.max(0, z / (spell.reach * FLOW.reachScale)));
	const base = spell.footprint * (1 - FLOW.narrow * smoothstep(0, 0.95, hn)) + 0.04;
	const x = Math.cos(angle) * base;
	const y = Math.sin(angle) * base;
	return base * (1 + FLOW.boundaryWander * vnoise(x * 1.5, y * 1.5, tSec * 0.6 + z * 1.3));
}

/**
 * The radius the mass is actually seen to reach at this height, which is where a
 * lick belongs. {@link boundaryRadius} is the surface the shader *aims* parcels
 * at; turbulence throws them past it, so the drawn edge stands further out.
 */
export function silhouetteRadius(
	spell: HybridSpell,
	angle: number,
	z: number,
	tSec: number
): number {
	return boundaryRadius(spell, angle, z, tSec) * FLOW.silhouette;
}

/**
 * How much fluid covers this point, 0..1. A brush mark multiplies its opacity by
 * it, so a mark that outruns the mass fades instead of flying off as confetti.
 */
export function massDensity(
	spell: HybridSpell,
	x: number,
	y: number,
	z: number,
	tSec: number,
	emission: number
): number {
	const radius = Math.hypot(x, y);
	const edge = silhouetteRadius(spell, Math.atan2(y, x), z, tSec);
	const across = 1 - smoothstep(edge * 0.72, edge * 1.3 + 0.1, radius);
	const along = 1 - smoothstep(spell.reach * 1.0, spell.reach * 1.85, z);
	return across * along * (0.3 + 0.7 * Math.min(1, emission * 1.4));
}

/** What the field does to a body at this point, in seal units per second squared. */
export interface FlowSample {
	x: number;
	y: number;
	z: number;
	/** How fast the flow itself is moving here, for the tear test. */
	outward: number;
}

/**
 * The whole force field at one point: buoyancy, the pinch, the swirl, and two
 * curl octaves. `age01` is how far through its own life the body is, `punch` the
 * strike's overpressure — both are the shader's, so both fields agree.
 */
export function flowAccel(
	out: FlowSample,
	spell: HybridSpell,
	x: number,
	y: number,
	z: number,
	tSec: number,
	age01: number,
	punch: number
): void {
	const reach = spell.reach * FLOW.reachScale;
	const hn = Math.min(1.6, Math.max(0, z / reach));
	const heat = 1 - age01;
	const radius = Math.hypot(x, y);
	const inX = radius > 1e-4 ? -x / radius : 0;
	const inY = radius > 1e-4 ? -y / radius : 0;

	out.x = 0;
	out.y = 0;
	out.z = FLOW.buoyancy * heat ** 1.15 * (1 - 0.22 * smoothstep(0.7, 1.3, hn));

	const target = boundaryRadius(spell, Math.atan2(y, x), z, tSec);
	const squeeze = spell.converge * 9 * Math.max(radius - target, 0) + spell.converge * 0.7 * heat;
	out.x += inX * squeeze;
	out.y += inY * squeeze;
	out.x += -inY * FLOW.swirl * radius;
	out.y += inX * FLOW.swirl * radius;
	out.outward = -squeeze;

	const qx = x * FLOW.noiseScale;
	const qy = y * FLOW.noiseScale;
	const qz = z * FLOW.noiseScale - tSec * FLOW.noiseRise;
	const gain =
		FLOW.turbulence * (0.48 + 1.4 * smoothstep(0, 0.55, hn) + 0.55 * punch) * (0.5 + 0.7 * age01);
	curlNoise(out, qx, qy, qz, gain);
	curlNoise(out, qx * 2.9 + 13.7, qy * 2.9 + 13.7, qz * 2.9 + 13.7, gain * 0.52);
}

/** Drag over one step, as the shader applies it. */
export function dragOver(dt: number, age01: number): number {
	return Math.exp(-(FLOW.drag + 2.4 * age01) * dt);
}
