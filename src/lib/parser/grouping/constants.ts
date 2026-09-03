/** Ink gap, in ring radii, beyond which two strokes share no affinity. */
export const AFFINITY_REACH_NORM = 0.2;
/** Exponent shaping how fast affinity falls off with the gap. */
export const AFFINITY_FALLOFF = 2;
/** Affinity two center-layer strokes always share: one sigil sits at the center. */
export const CENTER_AFFINITY = 0.5;
/** Center-to-center distance, in ring radii, within which the center prior applies. */
export const CENTER_AFFINITY_DISTANCE_NORM = 0.54;
/** Affinity a stroke drawn inside another stroke's footprint shares with it. */
export const ENCLOSED_AFFINITY = 0.85;
/** Footprint padding, in ring radii, used by the enclosure test. */
export const ENCLOSURE_PAD_NORM = 0.04;
/** Affinity a stroke keeps for standing alone; sets how hard its links pull. */
export const SELF_AFFINITY = 0.5;
/** Wholeness below this floor is worth nothing to the partition. */
export const WHOLENESS_FLOOR = 0.3;
/** Minimum affinity for two strokes to share a component. */
export const COMPONENT_AFFINITY_MIN = 0.2;
/** Minimum affinity for affinity-only grouping, used without a dictionary. */
export const FALLBACK_AFFINITY_MIN = 0.5;
/** Largest normalized symbol candidate accepted by grouping. */
export const MAX_SYMBOL_SIZE_NORM = 0.58;
/** Most strokes one group hypothesis may hold. */
export const MAX_GROUP_STROKES = 20;
/** Largest component the partition search takes; bigger ones split by affinity first. */
export const MAX_COMPONENT_STROKES = 30;
/** Wholeness from which a group counts as a clean glyph whose leftovers are proposed too. */
export const LEFTOVER_MIN_WHOLENESS = 0.4;
/** Most clean glyphs whose leftovers are proposed, taken from the strongest reads. */
export const LEFTOVER_MAX_SEEDS = 6;
/** Memo states the exact partition search may visit before it falls back to greedy. */
export const PARTITION_STATE_BUDGET = 100_000;
