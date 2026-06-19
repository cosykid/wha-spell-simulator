import type { Point, RecognitionKind, Vector } from '../../types.js';

/** Recognition kinds that can be backed by dictionary examples. */
export type KnownRecognitionKind = Exclude<RecognitionKind, 'unknown'>;

/** Options used when fitting candidate ink into normalized shape space. */
export interface ShapeNormalizeOptions {
	pointCount?: number;
	rotationDeg?: number;
	inkSize?: number;
}

/**
 * A dictionary or labelled-sample glyph in normalized stroke form.
 *
 * Recognition examples are reusable across candidates and are cached by object
 * identity, so callers should keep them stable between recomputes when possible.
 */
export interface RecognitionExample {
	id: string;
	kind: KnownRecognitionKind;
	symbolId: string;
	strokes: Point[][];
	source: string;
	rotationInvariant: boolean;
	allowedRotationsDeg?: number[];
}

/** Strokes normalized to a unit square plus an arc-length sampled point cloud. */
export interface NormalizedShape {
	strokes: Vector[][];
	pointCloud: Vector[];
}

/** Rasterized normalized ink with a per-pixel distance field. */
export interface InkDistanceMap {
	size: number;
	mask: Uint8Array;
	inkPixels: number[];
	distanceMap: Float32Array;
	ink: number;
}

/** Low-level ink overlap and distance features used by shape matching. */
export interface ChamferScore {
	chamferDistance: number;
	chamferScore: number;
	candidateExplainedRatio: number;
	templateCoveredRatio: number;
	unexplainedInkRatio: number;
	missingInkRatio: number;
	softDiceScore: number;
	inkScore: number;
	contaminationRisk: number;
}

/** Full score for comparing one candidate against one recognition example. */
export interface ShapeMatcherResult extends ChamferScore {
	available: boolean;
	confidence: number;
	$pDistance: number;
	pScore: number;
	directDistance: number;
	rotationDeg: number;
	recognitionRotationDeg: number;
}
