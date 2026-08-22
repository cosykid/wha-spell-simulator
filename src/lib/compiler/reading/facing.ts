/**
 * @file The facing source hierarchy, the dead band, and facing quantization.
 *
 * A sign's facing is stored as a twist away from inward: 0 faces the seal
 * center, +/-90 sideways, 180 straight outward, positive counter-clockwise on
 * screen. The hierarchy tries the ML pose head first and falls back through
 * weaker evidence, so a missing ML verdict degrades instead of collapsing every
 * facing to canon inward the way `field/buildSpellField.ts` does today. The
 * tiers below `ml-pose` are new here, per `docs/animation-redesign.md` section 1.
 */

import {
	normalizeAngleDeg,
	signedAngleDifferenceDeg,
	vectorFromAngleDeg
} from '../../utils/geometry.js';
import type { FacingClass, FacingSource, RadialFacing, Recognition, Vector } from '../../types.js';

export const FACING_TUNING = {
	/** Twists this small are drawing jitter, not intent, so they snap to inward. */
	deadBandDeg: 12,
	/** How far from a named direction a facing may sit before it reads as oblique. */
	obliqueThresholdDeg: 35,
	/** Extra room a class keeps once held, so a facing on a boundary cannot flap. */
	hysteresisMarginDeg: 8
};

/** Sign templates are authored at the bottom of the ring. See `parser/signRotation.ts`. */
const CANONICAL_SIGN_BEARING_DEG = 270;

/** The canonical example faces the seal center, a quarter turn off its own bearing. */
const CANONICAL_POSE_OFFSET_DEG = 90;

const INWARD_OFFSET_DEG = 180;

const CANONICAL_TWIST_DEG: Record<Exclude<FacingClass, 'oblique'>, number> = {
	inward: 0,
	'tangential-cw': 90,
	outward: 180,
	'tangential-ccw': -90
};

/**
 * A sign at the east rim facing screen-down pushes material east to south, which
 * reads clockwise. That is a twist of +90, and it matches how the parser labels
 * `radialFacing`.
 */
const RADIAL_FACING_TWIST_DEG: Partial<Record<RadialFacing, number>> = {
	inward: 0,
	outward: 180,
	clockwise: 90,
	counterclockwise: -90
};

export interface TwistReading {
	twistDeg: number;
	source: FacingSource;
}

/**
 * Turns "degrees the glyph is rotated from its canonical example" into the twist
 * away from inward. Removing the sign's ring bearing and the canonical inward
 * pose leaves only the rotation the drawer chose.
 */
function twistFromCanonicalRotation(rotationDeg: number, bearingDeg: number): number {
	return signedAngleDifferenceDeg(0, -(rotationDeg + bearingDeg + CANONICAL_POSE_OFFSET_DEG));
}

/** The pose head measures rotation directly, but only its accepted verdicts are calibrated. */
function mlPoseTwistDeg(sign: Recognition): number | null {
	if (!sign.diagnostics?.ml?.accepted || sign.rotationOffsetDeg == null) {
		return null;
	}
	return twistFromCanonicalRotation(sign.rotationOffsetDeg, sign.angleDeg ?? 0);
}

/**
 * `parser/signRotation.ts` pre-rotates a sign into the bottom-of-ring frame
 * before matching, so a template offset is dominated by that pre-rotation and
 * only the residual is evidence. The residual is bounded by the matcher's
 * tolerance, which is why this tier is weak and why the two paths' opposite
 * rotation sign conventions cannot move the facing out of the inward class.
 */
function templateRotationTwistDeg(sign: Recognition): number | null {
	if (sign.rotationOffsetDeg == null) {
		return null;
	}
	const preRotationDeg = normalizeAngleDeg((sign.angleDeg ?? 0) - CANONICAL_SIGN_BEARING_DEG);
	return signedAngleDifferenceDeg(preRotationDeg, sign.rotationOffsetDeg);
}

/**
 * Draw order carries facing only for a single-stroke sign. Reading it on a
 * multi-stroke glyph once made four columns spray outward as fake inverted ones,
 * so the stroke count gates the whole tier. See `../../field/CLAUDE.md`.
 */
function strokeGeometryTwistDeg(sign: Recognition): number | null {
	if ((sign.strokeIds?.length ?? 0) !== 1) {
		return null;
	}
	return RADIAL_FACING_TWIST_DEG[sign.radialFacing] ?? null;
}

const FACING_HIERARCHY: { source: FacingSource; twistDeg: (sign: Recognition) => number | null }[] =
	[
		{ source: 'ml-pose', twistDeg: mlPoseTwistDeg },
		{ source: 'template-rotation', twistDeg: templateRotationTwistDeg },
		{ source: 'stroke-geometry', twistDeg: strokeGeometryTwistDeg }
	];

/** Small twists are jitter. Snapping them keeps a tidy drawing free of incidental bias. */
export function deadBandTwistDeg(twistDeg: number): number {
	return Math.abs(twistDeg) < FACING_TUNING.deadBandDeg ? 0 : twistDeg;
}

/**
 * Reads a sign's twist from the best evidence it carries. Falls through to
 * canon's inward pose, which is a default rather than a measurement, so the
 * source it reports is what {@link facingTrust} grades.
 */
export function readTwist(sign: Recognition): TwistReading {
	for (const tier of FACING_HIERARCHY) {
		const twistDeg = tier.twistDeg(sign);
		if (twistDeg != null) {
			return { twistDeg: deadBandTwistDeg(twistDeg), source: tier.source };
		}
	}
	return { twistDeg: 0, source: 'canonical' };
}

/** The unit facing of a sign sitting at `bearingDeg` and twisted off inward. */
export function facingFromTwist(bearingDeg: number, twistDeg: number): Vector {
	return vectorFromAngleDeg(bearingDeg + INWARD_OFFSET_DEG + twistDeg);
}

function distanceToClassDeg(
	facingClass: Exclude<FacingClass, 'oblique'>,
	twistDeg: number
): number {
	return Math.abs(signedAngleDifferenceDeg(CANONICAL_TWIST_DEG[facingClass], twistDeg));
}

function nearestClass(twistDeg: number): Exclude<FacingClass, 'oblique'> {
	const classes = Object.keys(CANONICAL_TWIST_DEG) as Exclude<FacingClass, 'oblique'>[];
	return classes.reduce((nearest, candidate) =>
		distanceToClassDeg(candidate, twistDeg) < distanceToClassDeg(nearest, twistDeg)
			? candidate
			: nearest
	);
}

/**
 * Quantizes a twist into the bucket rules branch on. A wild pose error lands in
 * a decisively wrong bucket instead of smearing the whole domain by a few
 * percent, which is how the 122-degree pose failure stayed invisible.
 */
export function classifyTwist(twistDeg: number): FacingClass {
	const nearest = nearestClass(twistDeg);
	return distanceToClassDeg(nearest, twistDeg) <= FACING_TUNING.obliqueThresholdDeg
		? nearest
		: 'oblique';
}

/** Whether a class still owns a twist once it is widened by the hysteresis margin. */
function holdsClass(facingClass: FacingClass, twistDeg: number): boolean {
	const nearest = nearestClass(twistDeg);
	if (facingClass === 'oblique') {
		return (
			distanceToClassDeg(nearest, twistDeg) >
			FACING_TUNING.obliqueThresholdDeg - FACING_TUNING.hysteresisMarginDeg
		);
	}
	return (
		distanceToClassDeg(facingClass, twistDeg) <=
		FACING_TUNING.obliqueThresholdDeg + FACING_TUNING.hysteresisMarginDeg
	);
}

/**
 * Quantizes with hysteresis. Recognition emits a template pass and then ML
 * refinements for the same ink, and their twists differ, so a facing resting on
 * a class boundary would otherwise change meaning between passes.
 *
 * @example
 * quantizeFacing(38, 'inward'); // 'inward', held rather than flipped to oblique
 */
export function quantizeFacing(twistDeg: number, previousClass: FacingClass | null): FacingClass {
	const fresh = classifyTwist(twistDeg);
	if (!previousClass || previousClass === fresh) {
		return fresh;
	}
	return holdsClass(previousClass, twistDeg) ? previousClass : fresh;
}
