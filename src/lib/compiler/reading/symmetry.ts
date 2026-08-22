/**
 * @file n-fold symmetry detection with snapping.
 *
 * Signs drawn at near-even spacing around the ring were meant to be even. Left
 * as drawn, a four-column ring carries a few percent of incidental net facing
 * and the whole domain drifts sideways. Snapping the bearings exact makes it
 * read as a straight beam instead of a wobble.
 *
 * Symmetry is read over the whole sign ring, so a mixed arrangement (four
 * columns plus one region sign) reports none.
 */

import {
	degreesToRadians,
	normalizeAngleDeg,
	radiansToDegrees,
	signedAngleDifferenceDeg
} from '../../utils/geometry.js';

export const SYMMETRY_TUNING = {
	/** How far a bearing may sit from its ideal slot and still count as even. */
	toleranceDeg: 12,
	minFold: 2,
	/** Past this the slots are closer together than a sign is wide. */
	maxFold: 8
};

export interface SymmetryReading {
	fold: number;
	/** The snapped bearings, in the order the bearings were given. */
	bearingsDeg: number[];
}

/** The angle the whole arrangement is rotated by, averaged so no one sign anchors it. */
function phaseDeg(sortedBearingsDeg: number[], spacingDeg: number): number {
	const offsets = sortedBearingsDeg.map((bearingDeg, slot) =>
		degreesToRadians(bearingDeg - slot * spacingDeg)
	);
	const x = offsets.reduce((sum, offset) => sum + Math.cos(offset), 0);
	const y = offsets.reduce((sum, offset) => sum + Math.sin(offset), 0);
	return radiansToDegrees(Math.atan2(y, x));
}

/**
 * Detects even angular spacing and returns the exact bearings to use instead.
 * Returns null when the signs are not evenly spaced, in which case the drawing
 * is read exactly as drawn.
 *
 * @example
 * detectSymmetry([2, 88, 179, 271]); // { fold: 4, bearingsDeg: [0, 90, 180, 270] }
 */
export function detectSymmetry(bearingsDeg: number[]): SymmetryReading | null {
	const fold = bearingsDeg.length;
	if (fold < SYMMETRY_TUNING.minFold || fold > SYMMETRY_TUNING.maxFold) {
		return null;
	}

	const spacingDeg = 360 / fold;
	const ring = bearingsDeg
		.map((bearingDeg, index) => ({ bearingDeg: normalizeAngleDeg(bearingDeg), index }))
		.sort((a, b) => a.bearingDeg - b.bearingDeg);
	const phase = phaseDeg(
		ring.map((member) => member.bearingDeg),
		spacingDeg
	);

	const snapped = bearingsDeg.slice();
	for (const [slot, member] of ring.entries()) {
		const idealDeg = phase + slot * spacingDeg;
		if (
			Math.abs(signedAngleDifferenceDeg(idealDeg, member.bearingDeg)) > SYMMETRY_TUNING.toleranceDeg
		) {
			return null;
		}
		snapped[member.index] = normalizeAngleDeg(idealDeg);
	}

	return { fold, bearingsDeg: snapped };
}
