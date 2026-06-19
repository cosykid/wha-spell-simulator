import type { Vector } from '../../types.js';
import type { normalizeStrokesForTemplate } from '../templateNormalizer.js';

/** Cached sine/cosine pair for rotating normalized template-space points. */
export interface RotationTransform {
	cos: number;
	sin: number;
}

/** One binary ink mask and its occupied pixel count. */
export interface InkLayer {
	mask: Uint8Array;
	ink: number;
}

/** Tight, soft, and loose masks for the same normalized strokes. */
export interface InkLayers {
	core: InkLayer;
	soft: InkLayer;
	loose: InkLayer;
}

/** Cached normalized candidate strokes plus per-rotation rendered ink. */
export interface CandidateInkCache {
	normalized: ReturnType<typeof normalizeStrokesForTemplate>;
	rotations: Map<number, InkLayers>;
}

/** Ink-level comparison produced before confidence capping. */
export interface InkComparison {
	inkScore: number;
	candidateExplainedRatio: number;
	templateCoveredRatio: number;
	softDiceScore: number;
	unexplainedInkRatio: number;
	missingInkRatio: number;
	contaminationRisk: number;
	requiredCellCoverage: number;
	forbiddenCellInkRatio: number;
	regionScore: number;
}

export type TemplateSpacePoint = Vector;
