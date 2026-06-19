/** Pixel width/height for template ink masks. */
export const INK_SIZE = 40;
/** Tight candidate/reference ink radius. */
export const CORE_RADIUS = 1;
/** Slightly forgiving radius for overlap scoring. */
export const SOFT_RADIUS = 2;
/** Loose radius for coverage and contamination checks. */
export const LOOSE_RADIUS = 4;
/** Number of normalized samples used per stroke before rasterizing. */
export const CANDIDATE_SAMPLES_PER_STROKE = 40;
/** Grid resolution used to detect missing required regions and forbidden ink. */
export const REGION_GRID_SIZE = 10;
/** Small penalty that prevents arbitrary rotation ties from flickering. */
export const ROTATION_STABILITY_MARGIN = 0.018;
