/**
 * @file Builds the classic engine's `SpellField` from the seal reading. Each
 * sign's manifestation picks a force operator; its ring position, facing and
 * power parameterize it. The operators are documented in `spellField.ts` and the
 * canon behaviors in the sign dictionary's `sourceNotes`.
 *
 * Restored from `src/lib/field/buildSpellField.ts` at `b439a01` with one change:
 * it took `Recognition[]` and derived position, facing and alignment itself,
 * where raw recognition is no longer allowed downstream. It reads a
 * `SealReading` instead, which already carries all four — gated.
 *
 * @example
 * const field = buildSpellField(spellIR.reading);
 */

import {
	clamp,
	normalizeAngleDeg,
	normalizeVector,
	radiansToDegrees,
	signedAngleDifferenceDeg
} from '../../../utils/geometry.js';
import type { SealReading, SignReading, Vector } from '../../../types.js';
import type { FieldSource, RadialSource, SpawnDomain, SpellField } from './spellField.js';

const INWARD_OFFSET_DEG = 180;

// A sign at the seal center has no radial arm, so there is no inward to twist
// away from and its facing carries no dial reading.
const MINIMUM_ARM = 1e-4;

// A one-sided region arrangement needs this much facing coherence (net facing
// magnitude over total influence) to bias spawning into a sector.
const REGION_SECTOR_COHERENCE = 0.5;

// How far convergence focuses toward its signs' side; mirrors the
// convergenceProfile pointScale in semanticRules so both stay in agreement.
const CONVERGENCE_POINT_SCALE = 0.42;

const SEAL_CENTER: Vector = { x: 0, y: 0 };

export function emptySpellField(): SpellField {
	return { sources: [], domain: { mode: 'anywhere', strength: 0 } };
}

/**
 * A sign's strength in the field.
 *
 * The legacy builder used `signInfluence`, which folded confidence, size and
 * layer together. `SignReading.power` is size and layer only — the reading keeps
 * confidence out on purpose (R-06), so a doubted sign no longer pushes weaker
 * than a certain one. This is the one place the restored engine does not
 * reproduce `b439a01`'s numbers, and the trade is deliberate: confidence-weighted
 * force was one of the defects the redesign named.
 */
function influence(sign: SignReading): number {
	return sign.power;
}

function bearingDeg(vector: Vector): number {
	return normalizeAngleDeg(radiansToDegrees(Math.atan2(-vector.y, vector.x)));
}

/**
 * How far the sign's facing is rotated away from pointing at the seal center.
 * 0 faces straight inward, +/-90 sideways, 180 straight outward. This is the
 * twist dial canon describes for pull: angled pulls twist, inverted pulls push.
 *
 * The reading stores facing as a unit vector rather than as a twist, so the dial
 * is read back off it. `readSeal` builds that vector as `bearing + 180 + twist`,
 * which makes this the exact inverse.
 */
function facingTwistDeg(sign: SignReading): number {
	if (Math.hypot(sign.at.x, sign.at.y) < MINIMUM_ARM) {
		return 0;
	}
	return signedAngleDifferenceDeg(bearingDeg(sign.at) + INWARD_OFFSET_DEG, bearingDeg(sign.facing));
}

function radialSource(
	sign: SignReading,
	twistDeg: number,
	center: Vector = SEAL_CENTER
): RadialSource {
	return {
		kind: 'radial',
		sign: sign.id,
		center,
		twistDeg,
		strength: influence(sign)
	};
}

// Columns whose resolved facing points clearly outward are inverted; canon
// says an inverted column emits outward on all sides, like dispersion.
const COLUMN_INVERTED_TWIST_DEG = 135;

function columnSource(sign: SignReading): FieldSource {
	if (Math.abs(facingTwistDeg(sign)) >= COLUMN_INVERTED_TWIST_DEG) {
		return radialSource(sign, 180);
	}
	return {
		kind: 'axial',
		sign: sign.id,
		at: sign.at,
		strength: influence(sign)
	};
}

// Convergence signs share one focus point, so the group becomes a single
// attractor at their influence-weighted side of the seal.
function convergenceSource(signs: SignReading[]): RadialSource {
	const weighted = signs.reduce(
		(sum, sign) => ({
			x: sum.x + sign.at.x * influence(sign),
			y: sum.y + sign.at.y * influence(sign),
			influence: sum.influence + influence(sign)
		}),
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

/**
 * The reading already quantizes facing into the buckets the legacy builder
 * re-derived from a tolerance on the raw angle, so the classification is read
 * rather than measured. Both tangential classes and `oblique` are the sideways
 * case: they have no net radial side.
 */
function radialAlignment(sign: SignReading): RadialAlignment {
	if (sign.facingClass === 'inward' || sign.facingClass === 'outward') {
		return sign.facingClass;
	}
	return 'side';
}

// Canon region arrangements: opposed inward/outward pairs pin the magic onto
// the ring itself, arrows that agree on one absolute side shoot it that way,
// arrows that converge on the center confine it inside, and arrows that all
// face away keep it outside. Coherence (net facing over total influence)
// separates "same side" from "converging": one-sided arrows agree with each
// other, inward arrows point at the center and cancel each other out.
function regionDomain(signs: SignReading[]): SpawnDomain {
	const strength = clamp(signs.reduce((sum, sign) => sum + influence(sign), 0));
	const alignments = signs.map(radialAlignment);
	const inwardCount = alignments.filter((alignment) => alignment === 'inward').length;
	const outwardCount = alignments.filter((alignment) => alignment === 'outward').length;

	if (inwardCount > 0 && outwardCount > 0) {
		return { mode: 'ring', strength };
	}

	const net = signs.reduce(
		(sum, sign) => ({
			x: sum.x + sign.facing.x * influence(sign),
			y: sum.y + sign.facing.y * influence(sign),
			influence: sum.influence + influence(sign)
		}),
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
 * Compiles the read signs into the spell's force field. Manifestations the field
 * model never covered (crush, weave, bolt, ...) contribute no source and keep
 * flowing through the manifestation scalars instead.
 */
export function buildSpellField(reading: SealReading): SpellField {
	const sources: FieldSource[] = [];
	const regionSigns: SignReading[] = [];
	const convergenceSigns: SignReading[] = [];

	for (const sign of reading.signs) {
		switch (sign.manifestation) {
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
					sign: sign.id,
					at: sign.at,
					strength: influence(sign)
				});
				break;
			case 'directed':
				regionSigns.push(sign);
				sources.push({
					kind: 'directed',
					sign: sign.id,
					at: sign.at,
					direction: sign.facing,
					strength: influence(sign)
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

/** Compact stable digest, so a changed field resets the engine's particles. */
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
					return `b${Math.round(source.at.x * 20)},${Math.round(source.at.y * 20)}.${Math.round(source.strength * 100)}`;
			}
		})
		.sort()
		.join('|');
	const domain = `${field.domain.mode}.${Math.round(field.domain.strength * 100)}`;
	return `${domain}:${sources}`;
}
