/**
 * @file Facing trust and sign power, the two numbers `signInfluence` conflates
 * today. Trust says how much the reading believes a sign's direction; power says
 * how strong the sign is. Keeping them apart is what lets R-06 in
 * `docs/animation-spec.md` hold: a sign below the trust floor contributes its
 * length to the budget and nothing to aim, dispersion, or circulation.
 */

import { clamp } from '../../utils/geometry.js';
import type { FacingSource, Recognition, RecognitionStatus, SignReading } from '../../types.js';

/**
 * Declining down the hierarchy. `canonical` stays clear of the floor on a clean
 * drawing on purpose: a missing ML verdict must degrade the facing, not delete
 * it. An accepted ML pose cannot fall below the floor, because `acceptMlResult`
 * already gated it; quantization, not trust, is what contains a wrong pose.
 */
const FACING_SOURCE_TRUST: Record<FacingSource, number> = {
	'ml-pose': 0.92,
	'template-rotation': 0.6,
	'stroke-geometry': 0.38,
	canonical: 0.3
};

/** A recognition the parser itself doubts is a pose the reading should doubt too. */
const RECOGNITION_STATUS_TRUST: Record<RecognitionStatus, number> = {
	valid: 1,
	valid_messy: 0.85,
	ambiguous: 0.6,
	contaminated: 0.45,
	unknown: 0.3
};

const TRUST_TUNING = {
	/** Certainty scales trust rather than gating it, so a messy sign still points somewhere. */
	certaintyBase: 0.5,
	certaintyScale: 0.5
};

const POWER_TUNING = {
	sizeBase: 0.35,
	sizeScale: 2.6,
	sizeMin: 0.2,
	layerOuter: 1,
	layerMiddle: 0.88,
	layerOther: 0.62
};

/** R-06: below this a sign adds power, not direction. */
export const FACING_TRUST_FLOOR = 0.2;

/** How much of this sign's facing is evidence, from its source tier and how surely it was read. */
export function facingTrust(sign: Recognition, source: FacingSource): number {
	const certainty = clamp((sign.confidence ?? 0) * (sign.neatness ?? 0));
	const drawing = TRUST_TUNING.certaintyBase + TRUST_TUNING.certaintyScale * certainty;
	const status = RECOGNITION_STATUS_TRUST[sign.recognitionStatus] ?? 1;
	return clamp(FACING_SOURCE_TRUST[source] * drawing * status);
}

/**
 * Whether the Plan layer may fold this sign's facing into aim, dispersion, or
 * circulation. Its length always counts toward the budget either way.
 */
export function isFacingTrusted(reading: SignReading): boolean {
	return reading.facingTrust >= FACING_TRUST_FLOOR;
}

/** How strong the sign is: size and layer only, never confidence. */
export function signPower(sign: Recognition): number {
	const size = clamp(
		POWER_TUNING.sizeBase + (sign.sizeNorm ?? 0) * POWER_TUNING.sizeScale,
		POWER_TUNING.sizeMin,
		1
	);
	const layer =
		sign.layer === 'outer'
			? POWER_TUNING.layerOuter
			: sign.layer === 'middle'
				? POWER_TUNING.layerMiddle
				: POWER_TUNING.layerOther;
	return clamp(size * layer);
}
