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
