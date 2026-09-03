/** Confidence gap required before two close dictionary matches stop being ambiguous. */
export const RECOGNITION_AMBIGUITY_GAP = 0.065;
/** Small sign templates get stricter stroke-structure handling. */
export const SIMPLE_SIGN_STROKE_LIMIT = 6;
/** Very simple signs can receive a structural floor when all strokes line up. */
export const SIMPLE_SIGN_STRUCTURAL_FLOOR_STROKE_LIMIT = 2;
export const SIMPLE_SIGN_STRUCTURAL_FLOOR_SCORE = 0.86;
export const SIMPLE_SIGN_STRUCTURAL_FLOOR_CONFIDENCE = 0.54;
/** Above this wholeness, decomposition assumes the candidate is a sigil and skips signs. */
export const DECOMPOSITION_DOMINANT_SIGIL_SCORE = 0.85;
/** Template coverage at which a group starts to count as a whole glyph. */
export const DECOMPOSITION_COVERAGE_FLOOR = 0.3;
/** Template coverage from which a group counts as fully whole. */
export const DECOMPOSITION_COVERAGE_FULL = 0.8;
/** Footprint ratio to the entry's regular size below which a group is discounted. */
export const DECOMPOSITION_SIZE_RATIO_MIN = 0.45;
/**
 * Footprint ratios above which a group is discounted. A sigil drawn at twice
 * its regular size is a full-strength spell, so its ceiling stays high; a sign
 * that large is far more often two neighbours bridged into one group.
 */
export const DECOMPOSITION_SIZE_RATIO_MAX: Record<'sigil' | 'sign', number> = {
	sigil: 2.2,
	sign: 1.5
};
/** Ratio span past the ceiling over which the size discount fades to nothing. */
export const DECOMPOSITION_SIZE_RATIO_FADE = 1;
/** Minimum coverage before a simple sign can be considered complete. */
export const SIMPLE_SIGN_MIN_TEMPLATE_COVERAGE = 0.78;
export { REGION_MIN_LINE_SPREAD, REGION_SIGN_ID } from '../glyphConstants.js';
/** The region sign needs special geometry checks because flat marks can look similar. */
export const REGION_FULL_LINE_SPREAD = 0.26;
export const REGION_FLAT_CONFIDENCE_CAP = 0.34;
/** Bounds-normalized spacing used when measuring local curvature. */
export const SHAPE_RESAMPLE_STEP = 0.12;
/** Turning per unit length below which a segment is treated as running straight. */
export const STRAIGHT_CURVATURE_LIMIT = 1.1;
/** Endpoint gap under which a stroke counts as a closed loop. */
export const LOOP_CLOSE_FRACTION = 0.24;
