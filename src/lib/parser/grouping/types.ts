import type { CleanedStroke } from '../../types.js';

/** Parser-facing classification for a cleaned stroke around the detected ring. */
export interface StrokeClassification {
	strokeId: string;
	usedByParser: boolean;
	canJoinSymbol: boolean;
}

/** Node in the merge forest used for recognition-guided decomposition. */
export interface DecompositionNode {
	id: string;
	strokes: CleanedStroke[];
	children: DecompositionNode[];
	proximityScore: number;
}

/** Best tree cut below one decomposition node. */
export interface TreeSelection {
	value: number;
	groups: CleanedStroke[][];
}

/** Pairwise merge candidate for union-find forest construction. */
export interface MergeEdge {
	a: number;
	b: number;
	score: number;
}
