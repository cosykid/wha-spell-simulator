// Ring detection results — the casting circle that frames a glyph.

import type { Vector } from './geometry.js';

export interface RingGap {
	startAngle: number;
	endAngle: number;
	sizeDegrees: number;
}

export interface UnsupportedRing {
	center: Vector;
	radius: number;
	complete?: boolean;
	completeness?: number;
	strokeIds?: string[];
}

export interface RingInfo {
	found: boolean;
	complete?: boolean;
	completeness?: number;
	activationEvent?: boolean;
	center: Vector;
	radius: number;
	radiusNorm?: number;
	coverageRatio?: number;
	gap?: RingGap;
	gapArcLength?: number;
	roundness?: number;
	lineSmoothness?: number;
	neatness?: number;
	overdrawAmount?: number;
	strokeIds?: string[];
	score?: number;
	unsupportedNestedRings?: UnsupportedRing[];
	unsupportedMultipleRings?: UnsupportedRing[];
}
