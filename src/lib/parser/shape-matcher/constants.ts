/** Number of resampled points used by the point-cloud shape matcher. */
export const POINT_CLOUD_SIZE = 128;
/** Normalizes average point distance into a bounded [0, 1] mismatch value. */
export const POINT_DISTANCE_NORMALIZER = 0.42;
/** Pixel width/height for normalized ink distance maps. */
export const INK_MAP_SIZE = 40;
/** Radius, in ink-map pixels, used when rasterizing normalized strokes. */
export const INK_RADIUS = 1;
/** Normalizes chamfer distance into a bounded [0, 1] mismatch value. */
export const CHAMFER_DISTANCE_NORMALIZER = 0.2;
/** Distance threshold under which candidate ink is considered explained. */
export const EXPLAINED_DISTANCE = 2.6 / INK_MAP_SIZE;
/** Softer distance threshold used by dice-style overlap scoring. */
export const SOFT_DISTANCE = 2.2 / INK_MAP_SIZE;
/** Drops tiny decorative template strokes from simplified dictionary examples. */
export const SIMPLIFIED_TEMPLATE_STROKE_MIN_LENGTH = 0.07;
