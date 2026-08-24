/**
 * @file The one flow both populations ride, on the CPU.
 *
 * This is a line-for-line mirror of the force block in `flow.glsl.ts`: the same
 * hash, the same value noise, the same curl, and the same terms reading the same
 * {@link FlowShape} the shader gets as a row of a params texture. A brush mark
 * integrating {@link flowAccel} therefore travels the streamline a GPU parcel
 * beside it travels, which is what stops the marks reading as a second effect
 * laid over the first. **Change one and change the other.**
 *
 * One field serves all seven archetypes. An archetype is not a kernel here: it
 * is a {@link FlowShape} filled in differently plus a spawn program, which is
 * why a column, a whirl and a sink can share a substrate and still read as
 * themselves. `flowShape.ts` is the struct and `noise.ts` is what the curl is
 * folded out of.
 *
 * It also owns the two questions only the brush asks: where the mass's edge is
 * ({@link silhouetteRadius}) and how much mass covers a point
 * ({@link massDensity}).
 */

import { curlNoise, smoothstep, vnoise } from './noise.js';
import { FLOW } from './tuning.js';
import type { FlowShape } from './flowShape.js';

export { SPAWN, blankShape, type FlowShape, type SpawnKind } from './flowShape.js';

/** Where a point sits in the shape's own frame: height along the axis, and off it. */
export interface AxisFrame {
	/** Seal units along the axis from the origin. */
	along: number;
	/** Seal units off the axis. */
	radius: number;
	/** Unit vector pointing back onto the axis. Zero on the axis itself. */
	inX: number;
	inY: number;
	inZ: number;
	/** Azimuth about the axis, for the boundary's standing lobes. */
	angle: number;
}

const frame: AxisFrame = { along: 0, radius: 0, inX: 0, inY: 0, inZ: 0, angle: 0 };

/**
 * Resolves a seal-space point into the shape's own frame. Shared by the field,
 * the boundary and the brush, so "how far up the column" means one thing.
 */
export function axisFrame(shape: FlowShape, x: number, y: number, z: number): AxisFrame {
	const dx = x - shape.originX;
	const dy = y - shape.originY;
	const dz = z - shape.originZ;
	const along = dx * shape.axisX + dy * shape.axisY + dz * shape.axisZ;
	const ox = dx - shape.axisX * along;
	const oy = dy - shape.axisY * along;
	const oz = dz - shape.axisZ * along;
	const radius = Math.hypot(ox, oy, oz);
	frame.along = along;
	frame.radius = radius;
	if (radius > 1e-5) {
		frame.inX = -ox / radius;
		frame.inY = -oy / radius;
		frame.inZ = -oz / radius;
	} else {
		frame.inX = 0;
		frame.inY = 0;
		frame.inZ = 0;
	}
	// Azimuth is measured in the seal plane rather than in the tilted frame: the
	// lobes have to stand still on screen, and a lean must not spin them.
	frame.angle = Math.atan2(dy, dx);
	return frame;
}

/**
 * The radius the mass is pinched to at this height, wander and standing lobes
 * included. This is the surface the field aims parcels at, so it is where a
 * brush mark belongs.
 *
 * The two harmonics are defect 3 of the prototype review. Isotropic wander
 * roughens a cone without unmaking it, so the boundary also carries a three-fold
 * and a two-fold lobe that shear with height, and the mass grows shoulders no
 * viewer can name.
 */
export function boundaryRadius(
	shape: FlowShape,
	angle: number,
	along: number,
	tSec: number
): number {
	const hn = Math.min(1.6, Math.max(0, along / Math.max(shape.reach, 1e-3)));
	const base = shape.footprint * (1 - shape.narrow * smoothstep(0, 0.95, hn)) + 0.04;
	const x = Math.cos(angle) * base;
	const y = Math.sin(angle) * base;
	const lobes =
		1 +
		FLOW.lobeThree * Math.sin(angle * 3 + shape.lobePhase) +
		FLOW.lobeTwo * Math.sin(angle * 2 - shape.lobePhase * 1.7 + along * FLOW.lobeShear);
	return base * lobes * (1 + shape.wander * vnoise(x * 1.5, y * 1.5, tSec * 0.6 + along * 1.3));
}

/**
 * The radius the mass is actually seen to reach, which is where a mark belongs.
 * {@link boundaryRadius} is the surface the field _aims_ at; turbulence throws
 * parcels past it, so the drawn edge stands further out.
 */
export function silhouetteRadius(
	shape: FlowShape,
	angle: number,
	along: number,
	tSec: number
): number {
	return boundaryRadius(shape, angle, along, tSec) * FLOW.silhouette;
}

/**
 * How much mass covers this point, 0..1. A brush mark multiplies its opacity by
 * it, so a mark that outruns the mass fades instead of flying off as confetti.
 * This is the anti-confetti law's input.
 */
export function massDensity(
	shape: FlowShape,
	x: number,
	y: number,
	z: number,
	tSec: number
): number {
	const f = axisFrame(shape, x, y, z);
	const edge = silhouetteRadius(shape, f.angle, f.along, tSec);
	const across = 1 - smoothstep(edge * 0.72, edge * 1.3 + 0.1, f.radius);
	const reach = Math.max(shape.reach, 1e-3);
	const along = 1 - smoothstep(reach, reach * 1.85, f.along);
	// Behind the mouth there is no mass, whichever way the axis leans. A contained
	// shape says so with a negative mark floor and keeps its lower half.
	const behind = smoothstep(-reach * 0.9, -reach * 0.2, f.along);
	// A channel that has stopped emitting has no mass left to license a mark, so
	// the coverage goes with it rather than settling at a floor. Without this the
	// strike's own marks outlive the strike and lie on the paper as confetti.
	return across * along * behind * Math.min(1, shape.emission * 2.2);
}

/** What the field does to a body at a point, in seal units per second squared. */
export interface FlowSample {
	x: number;
	y: number;
	z: number;
	/** How hard the flow pushes out through the boundary here, for the tear test. */
	outward: number;
}

/**
 * The whole force field at one point: drive along the axis, the pinch, the
 * swirl, the signed sink, the lateral drag, containment, the lid, and two curl
 * octaves. `age01` is how far through its own life the body is and `punch` the
 * strike's overpressure, both of which the shader has too, so both fields agree.
 */
export function flowAccel(
	out: FlowSample,
	shape: FlowShape,
	x: number,
	y: number,
	z: number,
	tSec: number,
	age01: number
): void {
	const f = axisFrame(shape, x, y, z);
	const reach = Math.max(shape.reach, 1e-3);
	const hn = Math.min(1.6, Math.max(0, f.along / reach));
	const heat = 1 - age01;

	// Drive along the shape's own axis, strongest while hot and low.
	const lift = shape.buoyancy * heat ** 1.15 * (1 - 0.22 * smoothstep(0.7, 1.3, hn));
	out.x = shape.axisX * lift;
	out.y = shape.axisY * lift;
	out.z = shape.axisZ * lift;

	// The pinch. The boundary narrows with height and wanders, which is what
	// keeps the silhouette off a clean cylinder wall.
	const target = boundaryRadius(shape, f.angle, f.along, tSec);
	const squeeze = shape.converge * 9 * Math.max(f.radius - target, 0) + shape.converge * 0.7 * heat;
	out.x += f.inX * squeeze;
	out.y += f.inY * squeeze;
	out.z += f.inZ * squeeze;
	out.outward = -squeeze;

	// Swirl about the axis. The tangent is the axis crossed with the inward ray.
	if (shape.swirl !== 0) {
		const tx = shape.axisY * f.inZ - shape.axisZ * f.inY;
		const ty = shape.axisZ * f.inX - shape.axisX * f.inZ;
		const tz = shape.axisX * f.inY - shape.axisY * f.inX;
		const rate = shape.swirl * f.radius;
		out.x += tx * rate;
		out.y += ty * rate;
		out.z += tz * rate;
	}

	// The signed sink, in the seal plane: one term for a pull and its inversion.
	// It is a ring attractor at `pool` rather than a sink at the origin, which is
	// what "the medium draws inward onto the ring" actually means. Matter gathers
	// at a radius and is gently pushed back out of the exact centre, so nothing
	// piles into a singularity there.
	if (shape.sink !== 0) {
		const planar = Math.hypot(x - shape.originX, y - shape.originY);
		if (planar > 1e-5) {
			const pool = Math.max(shape.pool, 1e-3);
			const past = planar - pool;
			const gain = (shape.sink * past) / (Math.abs(past) + pool);
			out.x += (-(x - shape.originX) / planar) * gain;
			out.y += (-(y - shape.originY) / planar) * gain;
		}
	}

	out.x += shape.driftX;
	out.y += shape.driftY;

	// Containment: outside its shell the mass is drawn back onto the locus, which
	// is how a hold keeps a ball instead of a plume.
	if (shape.gather > 0) {
		const dx = shape.originX - x;
		const dy = shape.originY - y;
		const dz = shape.originZ - z;
		const distance = Math.hypot(dx, dy, dz);
		const past = distance - shape.holdRadius;
		if (distance > 1e-5 && past > 0) {
			const gain = (shape.gather * past) / distance;
			out.x += dx * gain;
			out.y += dy * gain;
			out.z += dz * gain;
		}
	}

	// The lid: a plane-hugging flow is one that is pushed back down above it.
	if (shape.ceiling > 0 && z > shape.ceiling) {
		out.z -= (z - shape.ceiling) * 6;
	}

	const qx = x * FLOW.noiseScale;
	const qy = y * FLOW.noiseScale;
	const qz = z * FLOW.noiseScale - tSec * FLOW.noiseRise;
	const gain =
		shape.turbulence *
		(0.48 + 1.4 * smoothstep(0, 0.55, hn) + 0.55 * shape.punch) *
		(0.5 + 0.7 * age01);
	curlNoise(out, qx, qy, qz, gain);
	curlNoise(out, qx * 2.9 + 13.7, qy * 2.9 + 13.7, qz * 2.9 + 13.7, gain * 0.52);
}

/** Drag over one step, as the shader applies it. */
export function dragOver(shape: FlowShape, dt: number, age01: number): number {
	return Math.exp(-(shape.drag + 2.4 * age01) * dt);
}
