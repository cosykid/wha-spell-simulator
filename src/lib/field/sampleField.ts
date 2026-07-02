// Samples the superposed spell field and turns the spawn domain into
// positions. All math is in seal space (ring center origin, ring radius 1);
// the renderer projects results onto the tilted portal.

import { degreesToRadians, normalizeAngleDeg, radiansToDegrees } from '../utils/geometry.js';
import type { DirectedSource, FieldVector, SpawnDomain, SpellField, Vector } from '../types.js';

const FIELD_TUNING = {
	// How strongly a column's off-center position leans the beam sideways.
	axialLean: 0.8,
	// Distance from a radial source's center where its force peaks. Below this
	// the force ramps to zero so the center is not a singularity.
	radialCore: 0.4,
	// Distance over which a region's directed jet fades to half strength.
	directedReach: 0.6,
	// Lift per unit of tangential flow: swirl about the seal pumps magic up the
	// out-axis like a tornado updraft, regardless of spin direction.
	swirlLift: 0.35,
	minimumDistance: 1e-4
};

const SPAWN_RADII = {
	anywhere: { base: 0, spread: 0.85 },
	inside: { base: 0, spread: 0.6 },
	outside: { base: 1.08, spread: 0.45 },
	ring: { base: 0.92, spread: 0.16 },
	sector: { base: 0.35, spread: 0.55 }
};

const SECTOR_HALF_ANGLE_DEG = 55;

/** Rotates a seal-space vector by degrees, matching vectorFromAngleDeg's convention. */
function rotateByDeg(vector: Vector, deg: number): Vector {
	const radians = degreesToRadians(deg);
	const cos = Math.cos(radians);
	const sin = Math.sin(radians);
	return {
		x: vector.x * cos + vector.y * sin,
		y: vector.y * cos - vector.x * sin
	};
}

function bearingDeg(vector: Vector): number {
	return normalizeAngleDeg(radiansToDegrees(Math.atan2(-vector.y, vector.x)));
}

// Finite-core falloff: zero at the center, peaks at radialCore, then decays
// slowly so pulls keep reaching past the ring the way canon describes.
function radialMagnitude(distance: number, strength: number): number {
	const core = FIELD_TUNING.radialCore;
	return (strength * 2 * core * distance) / (core * core + distance * distance);
}

// How tangential a jet is about the seal center: |at x direction| / |at|.
// 1 when the jet is perpendicular to its radial arm, 0 when aimed along it
// or placed at the center, where there is no arm to swirl around.
function directedTangentialness(source: DirectedSource): number {
	const arm = Math.hypot(source.at.x, source.at.y);
	if (arm < FIELD_TUNING.minimumDistance) {
		return 0;
	}
	return Math.abs(source.at.x * source.direction.y - source.at.y * source.direction.x) / arm;
}

/**
 * The net force on unit-mass magic at seal-space point `p`: every source's
 * contribution summed. Behaviors emerge from this sum alone — balanced columns
 * cancel their lean, angled pulls form a vortex, opposed pushes cancel.
 */
export function sampleFieldForce(field: SpellField, p: Vector): FieldVector {
	const force: FieldVector = { x: 0, y: 0, z: 0 };

	for (const source of field.sources) {
		switch (source.kind) {
			case 'axial': {
				force.z += source.strength;
				force.x += source.at.x * FIELD_TUNING.axialLean * source.strength;
				force.y += source.at.y * FIELD_TUNING.axialLean * source.strength;
				break;
			}
			case 'radial': {
				const dx = p.x - source.center.x;
				const dy = p.y - source.center.y;
				const distance = Math.hypot(dx, dy);
				if (distance < FIELD_TUNING.minimumDistance) {
					break;
				}
				const inward = { x: -dx / distance, y: -dy / distance };
				const direction = rotateByDeg(inward, source.twistDeg);
				const magnitude = radialMagnitude(distance, source.strength);
				force.x += direction.x * magnitude;
				force.y += direction.y * magnitude;
				// The tangential fraction of the flow pumps lift up the seal axis.
				force.z +=
					magnitude *
					Math.abs(Math.sin(degreesToRadians(source.twistDeg))) *
					FIELD_TUNING.swirlLift;
				break;
			}
			case 'directed': {
				const dx = p.x - source.at.x;
				const dy = p.y - source.at.y;
				const reach = FIELD_TUNING.directedReach;
				const falloff = 1 / (1 + (dx * dx + dy * dy) / (reach * reach));
				force.x += source.direction.x * source.strength * falloff;
				force.y += source.direction.y * source.strength * falloff;
				force.z +=
					source.strength * falloff * directedTangentialness(source) * FIELD_TUNING.swirlLift;
				break;
			}
			case 'buoyancy': {
				force.z += source.strength;
				break;
			}
		}
	}

	return force;
}

/** Total uniform lift, for renderers that damp gravity instead of integrating z. */
export function fieldBuoyancy(field: SpellField): number {
	return field.sources.reduce(
		(sum, source) => (source.kind === 'buoyancy' ? sum + source.strength : sum),
		0
	);
}

/**
 * A random spawn position inside the domain. `random` is injectable so tests
 * can drive it deterministically.
 */
export function spawnDomainPosition(
	domain: SpawnDomain,
	random: () => number = Math.random
): Vector {
	const radii = SPAWN_RADII[domain.mode];
	const radius = radii.base + radii.spread * Math.sqrt(random());

	if (domain.mode === 'sector' && domain.direction) {
		const center = bearingDeg(domain.direction);
		const jitter = (random() * 2 - 1) * SECTOR_HALF_ANGLE_DEG;
		const angle = degreesToRadians(center + jitter);
		return { x: Math.cos(angle) * radius, y: -Math.sin(angle) * radius };
	}

	const angle = random() * Math.PI * 2;
	return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}
