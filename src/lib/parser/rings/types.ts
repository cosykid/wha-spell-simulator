import type { RingGap, Vector } from '../../types.js';

/** Simple circle fit used while collecting ring candidates. */
export interface Circle {
	center: Vector;
	radius: number;
}

/** How much of one stroke follows a reference circle. */
export interface StrokeCircleMetrics {
	totalLength: number;
	nearLength: number;
	nearRatio: number;
}

/** Ring geometry measured before candidate ranking metadata is attached. */
export interface MeasuredRing {
	found: true;
	center: Vector;
	radius: number;
	complete: boolean;
	completeness: number;
	coverageRatio: number;
	gap: RingGap;
	gapArcLength: number;
	roundness: number;
	lineSmoothness: number;
	neatness: number;
	overdrawAmount: number;
	strokeIds: string[];
}

/** Ring candidate plus the score used to rank it against alternatives. */
export interface RingCandidate extends MeasuredRing {
	score: number;
}
