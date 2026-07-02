// Builds the SpellField from recognized signs. Each sign's manifestation picks
// a force operator; its ring position, facing, and influence parameterize it.
// See docs on each operator in types/spell-field.ts and the canon behaviors in
// the sign dictionary's sourceNotes.

import { signInfluence } from '../compiler/semanticRules.js';
import { clamp, normalizeVector, vectorFromAngleDeg } from '../utils/geometry.js';
import type {
	FieldSource,
	RadialSource,
	Recognition,
	SpawnDomain,
	SpellField,
	Vector
} from '../types.js';

const INWARD_OFFSET_DEG = 180;

// Facings within this angle of the radial axis count as inward/outward when
// classifying region arrangements; anything else is a sideways push.
const REGION_ALIGN_TOLERANCE_DEG = 50;

// A one-sided region arrangement needs this much facing coherence (net facing
// magnitude over total influence) to bias spawning into a sector.
const REGION_SECTOR_COHERENCE = 0.5;

// How far convergence focuses toward its signs' side; mirrors the
// convergenceProfile pointScale in semanticRules so both stay in agreement.
const CONVERGENCE_POINT_SCALE = 0.42;

export function emptySpellField(): SpellField {
	return { sources: [], domain: { mode: 'anywhere', strength: 0 } };
}

/** The sign's position in seal space (ring center origin, ring radius 1). */
function sealPosition(sign: Recognition): Vector {
	const radial = vectorFromAngleDeg(sign.angleDeg ?? 0);
	const radius = clamp(sign.radiusNorm ?? 0, 0, 1.2);
	return { x: radial.x * radius, y: radial.y * radius };
}

function facingDirection(sign: Recognition): Vector {
	return vectorFromAngleDeg(sign.directedOrientationDeg ?? sign.orientationDeg ?? 0);
}

/** Signed degrees from one bearing to another, in (-180, 180]. */
function signedAngleDifferenceDeg(fromDeg: number, toDeg: number): number {
	const wrapped = (((toDeg - fromDeg) % 360) + 360) % 360;
	return wrapped > 180 ? wrapped - 360 : wrapped;
}

/**
 * How far the sign's facing is rotated away from pointing at the seal center.
 * 0 faces straight inward, +/-90 sideways, 180 straight outward. This is the
 * twist dial canon describes for pull: angled pulls twist, inverted pulls push.
 */
export function facingTwistDeg(sign: Recognition): number {
	const inwardDeg = (sign.angleDeg ?? 0) + INWARD_OFFSET_DEG;
	const facingDeg = sign.directedOrientationDeg ?? sign.orientationDeg ?? inwardDeg;
	return signedAngleDifferenceDeg(inwardDeg, facingDeg);
}

const SEAL_CENTER: Vector = { x: 0, y: 0 };

function radialSource(
	sign: Recognition,
	twistDeg: number,
	center: Vector = SEAL_CENTER
): RadialSource {
	return {
		kind: 'radial',
		sign: sign.id ?? 'sign',
		center,
		twistDeg,
		strength: signInfluence(sign)
	};
}

// Canon: inverted column emits outward on all sides, like dispersion.
function columnSource(sign: Recognition): FieldSource {
	if (sign.radialFacing === 'outward') {
		return radialSource(sign, 180);
	}
	return {
		kind: 'axial',
		sign: sign.id ?? 'column',
		at: sealPosition(sign),
		strength: signInfluence(sign)
	};
}

// Convergence signs share one focus point, so the group becomes a single
// attractor at their influence-weighted side of the seal.
function convergenceSource(signs: Recognition[]): RadialSource {
	const weighted = signs.reduce(
		(sum, sign) => {
			const influence = signInfluence(sign);
			const at = sealPosition(sign);
			return {
				x: sum.x + at.x * influence,
				y: sum.y + at.y * influence,
				influence: sum.influence + influence
			};
		},
		{ x: 0, y: 0, influence: 0 }
	);
	const center =
		weighted.influence > 0
			? {
					x: (weighted.x / weighted.influence) * CONVERGENCE_POINT_SCALE,
					y: (weighted.y / weighted.influence) * CONVERGENCE_POINT_SCALE
				}
			: SEAL_CENTER;

	return {
		kind: 'radial',
		sign: 'convergence',
		center,
		twistDeg: 0,
		strength: clamp(weighted.influence)
	};
}

type RadialAlignment = 'inward' | 'outward' | 'side';

function radialAlignment(sign: Recognition): RadialAlignment {
	const twist = Math.abs(facingTwistDeg(sign));
	if (twist <= REGION_ALIGN_TOLERANCE_DEG) {
		return 'inward';
	}
	if (twist >= INWARD_OFFSET_DEG - REGION_ALIGN_TOLERANCE_DEG) {
		return 'outward';
	}
	return 'side';
}

// Canon region arrangements: opposed inward/outward pairs pin the magic onto
// the ring itself, arrows that agree on one absolute side shoot it that way,
// arrows that converge on the center confine it inside, and arrows that all
// face away keep it outside. Coherence (net facing over total influence)
// separates "same side" from "converging": one-sided arrows agree with each
// other, inward arrows point at the center and cancel each other out.
function regionDomain(signs: Recognition[]): SpawnDomain {
	const strength = clamp(signs.reduce((sum, sign) => sum + signInfluence(sign), 0));
	const alignments = signs.map(radialAlignment);
	const inwardCount = alignments.filter((alignment) => alignment === 'inward').length;
	const outwardCount = alignments.filter((alignment) => alignment === 'outward').length;

	if (inwardCount > 0 && outwardCount > 0) {
		return { mode: 'ring', strength };
	}

	const net = signs.reduce(
		(sum, sign) => {
			const influence = signInfluence(sign);
			const facing = facingDirection(sign);
			return {
				x: sum.x + facing.x * influence,
				y: sum.y + facing.y * influence,
				influence: sum.influence + influence
			};
		},
		{ x: 0, y: 0, influence: 0 }
	);
	const coherence = net.influence > 0 ? Math.hypot(net.x, net.y) / net.influence : 0;
	if (coherence >= REGION_SECTOR_COHERENCE) {
		return { mode: 'sector', direction: normalizeVector(net), strength };
	}

	if (inwardCount === signs.length) {
		return { mode: 'inside', strength };
	}
	if (outwardCount === signs.length) {
		return { mode: 'outside', strength };
	}

	// Tangential arrangements have no net side; the directed pushes still swirl.
	return { mode: 'anywhere', strength };
}

/**
 * Compiles recognized signs into the spell's force field. Signs the field
 * model does not cover yet (crush, weave, bolt, ...) contribute no source and
 * keep flowing through the manifestation scalars instead.
 */
export function buildSpellField(signs: Recognition[]): SpellField {
	const sources: FieldSource[] = [];
	const regionSigns: Recognition[] = [];
	const convergenceSigns: Recognition[] = [];

	for (const sign of signs) {
		switch (sign.semantic?.manifestation) {
			case 'column':
				sources.push(columnSource(sign));
				break;
			case 'dispersion':
				sources.push(radialSource(sign, 180));
				break;
			case 'pull':
				sources.push(radialSource(sign, facingTwistDeg(sign)));
				break;
			case 'collection':
				sources.push(radialSource(sign, 0));
				break;
			case 'convergence':
				convergenceSigns.push(sign);
				break;
			case 'levitation':
				sources.push({
					kind: 'buoyancy',
					sign: sign.id ?? 'levitation',
					strength: signInfluence(sign)
				});
				break;
			case 'directed':
				regionSigns.push(sign);
				sources.push({
					kind: 'directed',
					sign: sign.id ?? 'region',
					at: sealPosition(sign),
					direction: facingDirection(sign),
					strength: signInfluence(sign)
				});
				break;
		}
	}

	if (convergenceSigns.length) {
		sources.push(convergenceSource(convergenceSigns));
	}

	return {
		sources,
		domain: regionSigns.length ? regionDomain(regionSigns) : emptySpellField().domain
	};
}

/** Compact stable digest for SpellIR signatures, so field changes reset particles. */
export function spellFieldSignature(field: SpellField): string {
	const sources = field.sources
		.map((source) => {
			switch (source.kind) {
				case 'axial':
					return `a${Math.round(source.at.x * 20)},${Math.round(source.at.y * 20)}.${Math.round(source.strength * 100)}`;
				case 'radial':
					return `r${Math.round(source.twistDeg)}@${Math.round(source.center.x * 20)},${Math.round(source.center.y * 20)}.${Math.round(source.strength * 100)}`;
				case 'directed':
					return `d${Math.round(source.at.x * 20)},${Math.round(source.at.y * 20)}>${Math.round(source.direction.x * 10)},${Math.round(source.direction.y * 10)}.${Math.round(source.strength * 100)}`;
				case 'buoyancy':
					return `b${Math.round(source.strength * 100)}`;
			}
		})
		.sort()
		.join('|');
	const domain = `${field.domain.mode}.${Math.round(field.domain.strength * 100)}`;
	return `${domain}:${sources}`;
}
