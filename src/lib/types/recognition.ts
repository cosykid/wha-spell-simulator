// Symbol candidates and the recognition results scored against the dictionary.

import type { Bounds, Stroke, Vector } from './geometry.js';
import type { ElementId, LayerOrAny, RadialFacing, Semantic } from './dictionary.js';

export type RecognitionKind = 'sigil' | 'sign' | 'unknown';

export type RecognitionStatus = 'valid' | 'valid_messy' | 'ambiguous' | 'contaminated' | 'unknown';

/** A grouped set of strokes that may correspond to a dictionary symbol. */
export interface SymbolCandidate {
	candidateId: string;
	strokeIds: string[];
	rawStrokeCount: number;
	cleanedStrokeCount?: number;
	bounds: Bounds;
	center: Vector;
	radiusNorm: number;
	angleDeg: number;
	layer: LayerOrAny;
	nearBoundary: boolean;
	sizeNorm: number;
	lengthNorm: number;
	orientationDeg: number;
	directedOrientationDeg: number;
	radialFacing: RadialFacing;
	closedness?: number;
	overdrawAmount: number;
	neatness: number;
	strokes: Stroke[];
}

export interface TopMatch {
	kind: RecognitionKind;
	id: string;
	confidence: number;
	source?: 'template' | 'ml';
	templateConfidence?: number;
	mlConfidence?: number;
	$pDistance?: number;
	chamferDistance?: number;
	inkScore?: number;
	candidateExplainedRatio?: number;
	templateCoveredRatio?: number;
	structuralScore?: number;
	aspectScore?: number;
	strokeCountScore?: number;
	strokeProfileScore?: number;
	shapeScore?: number;
	rotationDeg?: number;
	recognitionRotationDeg?: number;
}

export interface RecognitionBestGuess {
	kind: RecognitionKind;
	id: string;
	confidence: number;
}

export interface RecognitionDiagnostics {
	bestGuess?: RecognitionBestGuess | null;
	recognitionRotationDeg: number;
	template: Record<string, number>;
	ml?: {
		available: boolean;
		accepted: boolean;
		confidence: number;
		margin: number;
		id: string | null;
		kind: RecognitionKind;
		angleDeg: number;
		scaleX: number;
		scaleY: number;
		centerX: number;
		centerY: number;
		superConfident?: boolean;
		verifierPassed?: boolean;
		reason?: string;
		error?: string;
		topMatches: TopMatch[];
	};
	matcher?: {
		$pDistance: number;
		chamferDistance: number;
		candidateExplainedRatio: number;
		templateCoveredRatio: number;
		unexplainedInkRatio: number;
	};
	structure: Record<string, number>;
	topMatches: TopMatch[];
}

/** The result of scoring a candidate against the dictionary. */
export interface Recognition {
	candidateId: string;
	strokeIds: string[];
	layer: LayerOrAny;
	nearBoundary: boolean;
	radiusNorm: number;
	angleDeg: number;
	sizeNorm: number;
	lengthNorm: number;
	orientationDeg: number;
	directedOrientationDeg: number;
	radialFacing: RadialFacing;
	/**
	 * Degrees the drawn glyph is rotated relative to its canonical example
	 * (counter-clockwise positive; 0 means drawn in the example's orientation).
	 * Sourced from the ML pose head when ML recognizes the glyph, otherwise from
	 * the template matcher's winning rotation. Distinct from `angleDeg`
	 * (ring position) and `orientationDeg` (dominant-axis orientation).
	 */
	rotationOffsetDeg: number;
	overdrawAmount: number;
	neatness: number;
	recognized: boolean;
	recognitionStatus: RecognitionStatus;
	kind: RecognitionKind;
	id: string | null;
	displayName: string | null;
	element: ElementId | null;
	semantic: Semantic | null;
	/** Copied from the recognized sigil entry; the glyph's regular ring-relative footprint. */
	referenceSizeNorm?: number | null;
	confidence: number;
	shape?: Record<string, number>;
	diagnostics?: RecognitionDiagnostics | null;
}

/** A recognition produced by `recognizeCandidates`, where diagnostics and shape are always populated. */
export interface RecognizedSymbol extends Recognition {
	shape: Record<string, number>;
	diagnostics: RecognitionDiagnostics;
}
