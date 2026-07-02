// Samples the superposed spell field and turns the spawn domain into
// positions. All math is in seal space (ring center origin, ring radius 1);
// the renderer projects results onto the tilted portal.

import { degreesToRadians, normalizeAngleDeg, radiansToDegrees } from '../utils/geometry.js';
import type { DirectedSource, FieldVector, SpawnDomain, SpellField, Vector } from '../types.js';

const FIELD_TUNING = {
	// How far a column's ring position shifts its beam axis off center, so the
	// beam manifests toward the side with the most or largest signs.
	axialLean: 0.55,
	// Beam footprint: the jet is strong within this distance of the beam axis
	// and soft outside it, so columns read as a column instead of a sheet.
	axialFootprint: 0.45,
	// Chimney draft: how strongly a column gathers magic toward its beam axis.
	axialConverge: 0.6,
	// Distance from a radial source's center where its force peaks. Below this
	// the force ramps to zero so the center is not a singularity.
	radialCore: 0.4,
	// Distance over which a region's directed jet fades to half strength.
	directedReach: 0.6,
	// Lift per unit of tangential flow: swirl about the seal pumps magic up the
	// out-axis like a tornado updraft, regardless of spin direction.
	swirlLift: 0.35,
	// Height (in ring radii) where levitation lift fades to zero, so held
	// magic settles into a hovering mass instead of climbing forever.
	hoverCeiling: 0.85,
	// How strongly levitation gathers its held magic toward the seal axis.
	hoverGather: 0.5,
	// The gather goes slack inside this radius so the held mass keeps volume
	// as a blob instead of collapsing to a point.
	hoverBlobRadius: 0.26,
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
 * The net force on unit-mass magic at seal-space point `p` at `height` above
 * the seal plane: every source's contribution summed. Behaviors emerge from
 * this sum alone — balanced columns cancel into one straight beam, angled
 * pulls form a vortex, levitation settles into a hovering mass.
 */
export function sampleFieldForce(field: SpellField, p: Vector, height: number = 0): FieldVector {
	const force: FieldVector = { x: 0, y: 0, z: 0 };

	for (const source of field.sources) {
		switch (source.kind) {
			case 'axial': {
				// The beam rises at an axis leaned toward the sign; magic is
				// drafted toward that axis and jetted up within the footprint.
				const axisX = source.at.x * FIELD_TUNING.axialLean;
				const axisY = source.at.y * FIELD_TUNING.axialLean;
				const dx = p.x - axisX;
				const dy = p.y - axisY;
				const distance = Math.hypot(dx, dy);
				const footprint = FIELD_TUNING.axialFootprint;
				const beam = 1 / (1 + (distance * distance) / (footprint * footprint));
				force.z += source.strength * beam;
				if (distance >= FIELD_TUNING.minimumDistance) {
					const draft = radialMagnitude(distance, source.strength) * FIELD_TUNING.axialConverge;
					force.x += (-dx / distance) * draft;
					force.y += (-dy / distance) * draft;
				}
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
				// Lift fades with altitude so held magic hovers at equilibrium
				// instead of climbing away; a gentle draft gathers it into one
				// mass over the seal.
				force.z += source.strength * Math.max(0, 1 - height / FIELD_TUNING.hoverCeiling);
				const distance = Math.hypot(p.x, p.y);
				const slack = Math.max(0, distance - FIELD_TUNING.hoverBlobRadius);
				if (distance >= FIELD_TUNING.minimumDistance && slack > 0) {
					const gather = radialMagnitude(slack, source.strength) * FIELD_TUNING.hoverGather;
					force.x += (-p.x / distance) * gather;
					force.y += (-p.y / distance) * gather;
				}
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
