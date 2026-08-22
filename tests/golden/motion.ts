/**
 * @file The motion golden tier's simulation: a seeded population of parcels
 * advected through the current `SpellField` with a fixed-step accumulator.
 *
 * Renderer independent by construction. It reads only `buildSpellField` and
 * `sampleFieldForce`, so a look change can never move a motion baseline, and a
 * physics change always does.
 */

import { buildSpellField } from '../../src/lib/field/buildSpellField.js';
import { sampleFieldForce, spawnDomainPosition } from '../../src/lib/field/sampleField.js';
import type { Recognition, SpellField } from '../../src/lib/types.js';
import { mulberry32, presetSeed } from './rng.js';

/** One test parcel in seal space: (x, y) on the seal, z out of the paper. */
export interface Parcel {
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	vz: number;
	/** Left the scene, so it no longer integrates and no longer rasterizes. */
	escaped: boolean;
}

export interface Population {
	field: SpellField;
	parcels: Parcel[];
	/** Whole steps taken. Time is `steps * MOTION.stepMs`, never a float sum. */
	steps: number;
}

export const MOTION = {
	// The redesign's fixed sim step (docs/animation-redesign.md, layer 4). Time
	// advances in whole steps only, so stepping fresh to a timestamp is
	// bit-identical to stepping there incrementally.
	stepMs: 1000 / 120,
	parcels: 240,
	// Acceleration per unit of field force, in seal units per second squared.
	// These carry over the current renderer's ratios (planar : lift : gravity)
	// expressed per second instead of per 60fps frame, because a frame-rate term
	// in a golden harness is a frame-rate-dependence generator.
	planarAccel: 5.76,
	liftAccel: 8.64,
	// Constant downward pull. Buoyancy must beat it for held magic to hover.
	gravity: 5.4,
	// Fraction of velocity retained after one second, so the population reads as
	// flow direction rather than as one launch that coasts forever.
	dragPerSecond: 0.064,
	// Parcels spawn just off the paper, the way the field effect seeds them.
	spawnHeight: 0.02,
	// Past this seal-space radius a parcel has left the scene for good.
	bounds: 2.6
} as const;

const STEP_SECONDS = MOTION.stepMs / 1000;
const STEP_DRAG = Math.pow(MOTION.dragPerSecond, STEP_SECONDS);

/** Whole steps that reach `atMs`. Timestamps must land on a step boundary. */
export function stepsFor(atMs: number): number {
	return Math.round(atMs / MOTION.stepMs);
}

/**
 * Seed a preset's population at rest on the seal, spawned through the field's
 * own domain so the aperture is part of what the baseline pins.
 */
export function spawnPopulation(presetId: string, signs: Recognition[]): Population {
	const field = buildSpellField(signs);
	const random = mulberry32(presetSeed(presetId));
	const parcels: Parcel[] = [];
	for (let i = 0; i < MOTION.parcels; i += 1) {
		const at = spawnDomainPosition(field.domain, random);
		parcels.push({
			x: at.x,
			y: at.y,
			z: MOTION.spawnHeight,
			vx: 0,
			vy: 0,
			vz: 0,
			escaped: false
		});
	}
	return { field, parcels, steps: 0 };
}

function advance(field: SpellField, parcel: Parcel): void {
	const force = sampleFieldForce(field, { x: parcel.x, y: parcel.y }, parcel.z);

	parcel.vx += force.x * MOTION.planarAccel * STEP_SECONDS;
	parcel.vy += force.y * MOTION.planarAccel * STEP_SECONDS;
	parcel.vz += (force.z * MOTION.liftAccel - MOTION.gravity) * STEP_SECONDS;

	parcel.x += parcel.vx * STEP_SECONDS;
	parcel.y += parcel.vy * STEP_SECONDS;
	parcel.z += parcel.vz * STEP_SECONDS;

	// The seal plane is the floor: grounded parcels pool instead of sinking.
	if (parcel.z < 0) {
		parcel.z = 0;
		parcel.vz = 0;
	}

	parcel.vx *= STEP_DRAG;
	parcel.vy *= STEP_DRAG;
	parcel.vz *= STEP_DRAG;

	if (Math.hypot(parcel.x, parcel.y) > MOTION.bounds || parcel.z > MOTION.bounds) {
		parcel.escaped = true;
	}
}

/** Advance the population to `atMs`. Stepping there in one call or in several is the same. */
export function stepTo(population: Population, atMs: number): Population {
	const target = stepsFor(atMs);
	while (population.steps < target) {
		for (const parcel of population.parcels) {
			if (!parcel.escaped) {
				advance(population.field, parcel);
			}
		}
		population.steps += 1;
	}
	return population;
}

/** A fresh population advanced to `atMs`, for callers that want one snapshot. */
export function simulateTo(presetId: string, signs: Recognition[], atMs: number): Population {
	return stepTo(spawnPopulation(presetId, signs), atMs);
}
