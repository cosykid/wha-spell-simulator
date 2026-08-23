/**
 * @file The shared flow every stroke smears along: a buoyant column stirred by
 * layered noise, in seal space (x right, y screen-down, z out of the paper).
 *
 * One field, sampled per stroke, is what makes the column read as a single mass
 * rather than as a crowd of sprites. The column's own numbers — speed, reach,
 * converge, footprint — come off the compiled jet track, and everything added on
 * top is turbulence, because a laminar column is exactly the stiffness this
 * direction is meant to answer.
 */

import type { BrushSpell } from './brushSpell.js';

/** A mutable seal-space vector, reused so a frame allocates nothing. */
export interface FlowVec {
	x: number;
	y: number;
	z: number;
}

/** Per-stroke inputs the field needs so two strokes at one point still diverge. */
export interface FlowStroke {
	x: number;
	y: number;
	z: number;
	/** Radians. Offsets this stroke's slice of the noise. */
	wander: number;
	/** How hard the noise takes hold of this stroke. */
	looseness: number;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
	const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

/**
 * Three octaves of sines standing in for curl noise. Cheap, non-repeating over
 * the length of a cast, and divergent enough that neighbouring strokes peel
 * apart the way pigment in a rising sheet does.
 */
function turbulence(out: FlowVec, s: FlowStroke, tSec: number, amount: number): void {
	const { x, y, z, wander } = s;
	out.x +=
		amount *
		(Math.sin(1.7 * z + tSec * 2.35 + 1.9 * x + wander) +
			0.52 * Math.sin(4.3 * z - tSec * 3.15 + 2.7 * y - wander) +
			0.27 * Math.sin(8.9 * z + tSec * 4.6 - 3.3 * x));
	out.y +=
		amount *
		(Math.sin(2.3 * z - tSec * 2.05 + 2.2 * y - wander * 0.7) +
			0.52 * Math.sin(3.7 * z + tSec * 2.95 - 2.3 * x + wander) +
			0.27 * Math.sin(9.4 * z - tSec * 4.1 + 3.1 * y));
	out.z +=
		amount *
		0.55 *
		(Math.sin(3.1 * x + 2.6 * y + tSec * 2.75 + wander) +
			0.4 * Math.sin(6.2 * z - tSec * 3.9 + wander * 1.7));
}

/**
 * The whole field at one stroke: buoyancy up the column, a foot that blooms then
 * drafts back onto the axis, a slow twist, turbulence, and a wandering gust that
 * leans the entire mass and lets it recover.
 */
export function sampleFlow(
	out: FlowVec,
	stroke: FlowStroke,
	spell: BrushSpell,
	tSec: number,
	drive: number
): void {
	const { x, y, z } = stroke;
	const r = Math.hypot(x, y);
	const rise = 0.42 + 0.92 * smoothstep(0, 0.62, z);
	const spent = 1 - 0.34 * smoothstep(spell.reach * 0.75, spell.reach * 2.6, z);
	const offAxis = 1 - 0.34 * Math.min(1, r / (spell.footprint * 2.4));

	out.x = 0;
	out.y = 0;
	out.z = spell.speed * drive * rise * spent * offAxis;

	// The foot blooms outward before the column drafts it back in, which is what
	// gives the base its skirt instead of a nozzle.
	const bloom = 0.24 * (1 - smoothstep(0.02, 0.34, z));
	const draft = -spell.converge * (r - 0.04) * 1.35 * smoothstep(0.12, 0.95, z);
	const radial = (bloom + draft) * drive;
	if (r > 1e-4) {
		out.x += (x / r) * radial;
		out.y += (y / r) * radial;
		// A slow twist, reversing with height, so the licks curl around each other.
		const twist = 0.62 * Math.sin(z * 2.1 + tSec * 1.4) * (0.3 + 0.7 * smoothstep(0, 1.3, z));
		out.x += (-y / r) * twist * drive;
		out.y += (x / r) * twist * drive;
	}

	turbulence(
		out,
		stroke,
		tSec,
		0.58 * stroke.looseness * (0.3 + 0.95 * smoothstep(0.04, 1.5, z)) * drive
	);

	// The gust: two beating rates, so the column leans, recovers, and never
	// repeats the same lean inside one cast.
	const gust = 0.34 * Math.sin(tSec * 1.85) * Math.sin(tSec * 0.71 + 1.1);
	const grip = smoothstep(0.1, 1.4, z) * drive;
	out.x += gust * grip;
	out.y += 0.42 * gust * Math.sin(tSec * 1.13 + 2.3) * grip;
}
