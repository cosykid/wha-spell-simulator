/**
 * @file `readSeal` — the Reading layer's entry point. Turns a parsed `GlyphAST`
 * into a `SealReading`, applying the four gating rules: the facing hierarchy and
 * dead band ({@link readTwist}), quantization with hysteresis
 * ({@link quantizeFacing}), symmetry snapping ({@link detectSymmetry}), and the
 * trust/power split ({@link facingTrust}).
 *
 * Contract: downstream spell code reads a `SealReading` and never a raw
 * `Recognition`. Specified in `docs/animation-redesign.md` section 1.
 *
 * @example
 * const reading = readSeal(glyphAST, previousReading);
 */

import { clamp, distance, normalizeAngleDeg, vectorFromAngleDeg } from '../../utils/geometry.js';
import { calculateSpellQuality } from '../spellQuality.js';
import { facingFromTwist, quantizeFacing, readTwist } from './facing.js';
import { detectSymmetry, type SymmetryReading } from './symmetry.js';
import { facingTrust, isFacingTrusted, signPower } from './trust.js';
import type {
	FacingClass,
	GlyphAST,
	ReadingNote,
	Recognition,
	SealReading,
	SignReading,
	Vector
} from '../../types.js';

/** Signs can drift just past the ring while still belonging to it. */
const MAX_RADIUS_NORM = 1.2;

/** Ink length arrives as a fraction of the ring circumference; seal units make the ring radius 1. */
const SEAL_CIRCUMFERENCE = Math.PI * 2;

/**
 * How far a sign may move between passes and still be the same sign. Recognition
 * rescores the same ink, so a real pairing barely moves; anything further is a
 * different sign and must not inherit its class.
 */
const HYSTERESIS_MATCH_RADIUS = 0.25;

/** Manifestation is never inferred, so a sign without one cannot be read. */
function readableSigns(signs: Recognition[]): Recognition[] {
	return signs.filter((sign) => sign.id != null && sign.semantic?.manifestation != null);
}

function sealPosition(bearingDeg: number, radiusNorm: number): Vector {
	const radial = vectorFromAngleDeg(bearingDeg);
	const radius = clamp(radiusNorm, 0, MAX_RADIUS_NORM);
	return { x: radial.x * radius, y: radial.y * radius };
}

/**
 * Pairs each sign with its counterpart in the previous reading so facing
 * hysteresis survives a recompile. Two signs match when they share a dictionary
 * id and sit within {@link HYSTERESIS_MATCH_RADIUS} seal units. The closest
 * pairs are taken first and each previous sign is claimed once, so two instances
 * of the same sign cannot both inherit from one predecessor.
 */
function matchPreviousClasses(
	signs: Recognition[],
	positions: Vector[],
	previous: SealReading | null
): (FacingClass | null)[] {
	const matched: (FacingClass | null)[] = signs.map(() => null);
	if (!previous) {
		return matched;
	}

	const pairs: { index: number; previousIndex: number; gap: number }[] = [];
	signs.forEach((sign, index) => {
		previous.signs.forEach((candidate, previousIndex) => {
			const gap = distance(positions[index], candidate.at);
			if (candidate.id === sign.id && gap <= HYSTERESIS_MATCH_RADIUS) {
				pairs.push({ index, previousIndex, gap });
			}
		});
	});
	pairs.sort((a, b) => a.gap - b.gap || a.index - b.index || a.previousIndex - b.previousIndex);

	const claimed = new Set<number>();
	for (const pair of pairs) {
		if (matched[pair.index] !== null || claimed.has(pair.previousIndex)) {
			continue;
		}
		matched[pair.index] = previous.signs[pair.previousIndex].facingClass;
		claimed.add(pair.previousIndex);
	}
	return matched;
}

function readingNotes(signs: SignReading[], symmetry: SymmetryReading | null): ReadingNote[] {
	const notes: ReadingNote[] = [];
	if (signs.some((sign) => !isFacingTrusted(sign))) {
		notes.push('facing-untrusted');
	}
	if (symmetry) {
		notes.push(`snapped-${symmetry.fold}-fold`);
	}
	return notes;
}

/**
 * Gates recognition noise into the reading every later layer is allowed to see.
 * `previous` is the reading from the last pass over the same drawing, used only
 * for facing hysteresis; omit it and every facing quantizes fresh.
 */
export function readSeal(glyphAST: GlyphAST, previous: SealReading | null = null): SealReading {
	const signs = readableSigns(glyphAST.signs ?? []);
	const drawnBearings = signs.map((sign) => normalizeAngleDeg(sign.angleDeg ?? 0));
	const symmetry = detectSymmetry(drawnBearings);
	const bearings = symmetry?.bearingsDeg ?? drawnBearings;
	const positions = bearings.map((bearingDeg, index) =>
		sealPosition(bearingDeg, signs[index].radiusNorm ?? 0)
	);
	const previousClasses = matchPreviousClasses(signs, positions, previous);

	// Snapping moves where inward points, not how far the sign twists off it, so
	// the measured twist rides along and four columns end up exactly concentric.
	const signReadings = signs.map((sign, index) => {
		const twist = readTwist(sign);
		return {
			id: sign.id as string,
			manifestation: sign.semantic?.manifestation as string,
			at: positions[index],
			length: (sign.lengthNorm ?? 0) * SEAL_CIRCUMFERENCE,
			facing: facingFromTwist(bearings[index], twist.twistDeg),
			facingClass: quantizeFacing(twist.twistDeg, previousClasses[index]),
			facingSource: twist.source,
			facingTrust: facingTrust(sign, twist.source),
			power: signPower(sign)
		};
	});

	return {
		signs: signReadings,
		sigil: glyphAST.primarySigil?.id ?? null,
		element: glyphAST.primarySigil?.element ?? null,
		quality: calculateSpellQuality(glyphAST),
		symmetry: symmetry?.fold ?? null,
		notes: readingNotes(signReadings, symmetry)
	};
}
