/** Minimum portion of a stroke set that must remain near a previous ring for filtered closure. */
export const MIN_CLOSURE_RELEVANT_POINT_RATIO = 0.15;
/** Angular bins used to measure open-ring coverage. */
export const RING_BIN_COUNT = 96;
/** Minimum stroke length for an open-ring seed. */
export const MIN_SEED_LENGTH_PX = 130;
/** Coverage needed before an open candidate is treated as found. */
export const FOUND_COMPLETENESS = 0.52;
/** Completeness floor required before an open ring can emit an activation event. */
export const ACTIVATION_COMPLETENESS_FLOOR = 0.64;
/** Minimum circularity for an open ring candidate. */
export const MIN_ROUNDNESS = 0.36;
export const OPEN_COVERAGE_HALF_WIDTH_PX = 12;
export const OPEN_COVERAGE_HALF_WIDTH_RATIO = 0.055;
export const OPEN_COLLECTION_MIN_RATIO = 0.45;
export const STROKE_SAMPLE_STEP_PX = 0.75;
export const TOPOLOGY_RING_STROKE_MIN_NEAR_CIRCLE_RATIO = 0.56;
export const TOPOLOGY_RING_STROKE_MIN_NEAR_CIRCLE_LENGTH_PX = 24;
export const TOPOLOGY_RING_PRUNE_COVERAGE_FLOOR = 0.88;
export const TOPOLOGY_RING_PRUNE_MAX_ANGULAR_SPAN_DEG = 24;
/** Tolerances for merging duplicate candidates that describe the same physical ring. */
export const SAME_RING_CENTER_DISTANCE_RATIO = 0.22;
export const SAME_RING_RADIUS_RATIO = 0.18;
/** Circle band used when measuring glyph tails; wide so honest wobble stays near. */
export const GLYPH_CIRCLE_BAND_HALF_WIDTH_MIN_PX = 18;
export const GLYPH_CIRCLE_BAND_HALF_WIDTH_RATIO = 0.13;
/** Ring-stroke ink outside the band, as a circumference fraction, that marks a glyph loop. */
export const GLYPH_CIRCLE_MAX_TAIL_RATIO = 0.24;
/** Radial bounds a non-ring stroke must span to count as crossing the circle line. */
export const GLYPH_CIRCLE_CROSS_INNER_RATIO = 0.85;
export const GLYPH_CIRCLE_CROSS_OUTER_RATIO = 1.15;
/** Crossing strokes alone that mark a glyph loop. */
export const GLYPH_CIRCLE_MIN_CROSSING_STROKES = 2;
/** Smaller tail ratio that suffices when at least one stroke crosses the circle. */
export const GLYPH_CIRCLE_TAIL_WITH_CROSSING_RATIO = 0.12;
/** Distance below which a non-ring stroke counts as touching the ring ink. */
export const GLYPH_CIRCLE_TOUCH_MIN_PX = 10;
export const GLYPH_CIRCLE_TOUCH_RATIO = 0.04;
/** Attached-stroke length, as a circumference fraction, that marks a glyph curl. */
export const GLYPH_CIRCLE_ATTACHED_MIN_LENGTH_RATIO = 0.2;
/** Angular bins for the lobe test; enough resolution for up to ~8 lobes. */
export const GLYPH_CIRCLE_LOBE_BIN_COUNT = 64;
/** Radial residual a lobe must reach before it counts, in px and radius fraction. */
export const GLYPH_CIRCLE_LOBE_AMPLITUDE_MIN_PX = 6;
export const GLYPH_CIRCLE_LOBE_AMPLITUDE_RATIO = 0.06;
/** Hysteresis sign flips of the radial residual that mark a lobed cloud loop. */
export const GLYPH_CIRCLE_MIN_LOBE_FLIPS = 6;
/** Endpoint distance from the circle line that reads as a glyph tick, in px and radius fraction. */
export const GLYPH_CIRCLE_FAR_END_MIN_PX = 10;
export const GLYPH_CIRCLE_FAR_END_RADIUS_RATIO = 0.17;
/** Complete candidates this much smaller than a supported reference ring are glyph ink. */
export const MIN_COMPLETE_RADIUS_VS_REFERENCE_RATIO = 0.7;
