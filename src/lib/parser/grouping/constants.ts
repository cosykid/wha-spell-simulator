/** Bounding-box padding, normalized by ring radius, used to join nearby strokes. */
export const BBOX_PADDING_NORM = 0.075;
/** Center-to-center distance below which same-layer strokes can group. */
export const CENTER_DISTANCE_NORM = 0.2;
/** Endpoint distance below which two strokes are considered touching. */
export const ENDPOINT_DISTANCE_NORM = 0.085;
/** Largest normalized symbol candidate accepted by grouping. */
export const MAX_SYMBOL_SIZE_NORM = 0.58;
/** Minimum pairwise proximity score required to form a decomposition edge. */
export const MERGE_SCORE_FLOOR = 0.42;
/** Tie tolerance that favors a whole node over its children. */
export const TREE_WHOLE_EPSILON = 0.015;
/** Stroke count above which expensive all-pairs proximity gets bbox pruning. */
export const SEGMENT_ALLPAIRS_CAP = 48;
/** Bbox gap, normalized by ring radius, above which pair scoring can be skipped. */
export const SEGMENT_PRUNE_GAP_NORM = 0.6;
