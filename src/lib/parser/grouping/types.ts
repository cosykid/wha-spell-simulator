import type { CleanedStroke } from '../../types.js';

/** Parser-facing classification for a cleaned stroke around the detected ring. */
export interface StrokeClassification {
	strokeId: string;
	usedByParser: boolean;
	canJoinSymbol: boolean;
}

/** Symmetric stroke-to-stroke affinity for one stroke list, indexed by position. */
export type AffinityMatrix = number[][];

/** One candidate group inside a component: a bitmask plus the member indexes it names. */
export interface GroupHypothesis {
	mask: number;
	members: number[];
}

/** A hypothesis after the objective has valued it. */
export interface ValuedGroup extends GroupHypothesis {
	/** How much the group reads as one complete glyph, from the recognizer. */
	wholeness: number;
	value: number;
}

/** The strokes and affinities one component's groups are valued against. */
export interface ComponentContext {
	strokes: CleanedStroke[];
	affinity: AffinityMatrix;
	/** Each stroke's share of the component's ink. Sums to 1. */
	inkShare: number[];
}
