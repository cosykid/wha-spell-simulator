import type { recognitionPlanForSymbol } from '../signRotation.js';
import type { RecognitionExample, ShapeMatcherResult } from '../shape-matcher/index.js';
import type {
	DictionaryEntry,
	RecognitionKind,
	StrokeTemplate,
	SymbolCandidate,
	TemplateMatch
} from '../../types.js';

/** Curvature summary that distinguishes angular, flowing, and looping glyphs. */
export interface ShapeSignature {
	straightness: number;
	loopRatio: number;
}

/** Cached structural metrics for one dictionary template. */
export interface TemplateFeatures {
	aspectRatio: number;
	elongation: number;
	strokeCount: number;
	orientationDeg: number;
	strokeProfile: number[];
	shapeSignature: ShapeSignature;
}

/** Structural metrics extracted from one grouped symbol candidate. */
export interface CandidateFeatures {
	aspectRatio: number;
	elongation: number;
	elongationNorm: number;
	strokeCount: number;
	strokeLengthImbalance: number;
	axisDominance: number;
	strokeProfile: number[];
	shapeSignature: ShapeSignature;
	lineSpread: number;
}

/** Detailed structural compatibility between candidate geometry and template geometry. */
export interface StructuralMatch {
	score: number;
	aspectScore: number;
	strokeCountScore: number;
	strokeProfileScore: number;
	shapeScore: number;
	axisScore: number;
	lineSpreadScore: number;
	candidateAspectRatio: number;
	templateAspectRatio: number;
	candidateStrokeCount: number;
	templateStrokeCount: number;
}

/** Template-matcher result plus the structural context used to accept or reject it. */
export interface ScoredTemplate {
	confidence: number;
	templateMatch: TemplateMatch | null;
	structuralMatch: StructuralMatch | null;
	matcher: ShapeMatcherResult | null;
}

/** Cached per-example work reused while scoring one candidate against many entries. */
export interface PrecomputedExampleScore {
	recognitionPlan: ReturnType<typeof recognitionPlanForSymbol>;
	matchFeatures: CandidateFeatures;
	matcher: ShapeMatcherResult;
}

/** One dictionary entry after its best example has been scored. */
export type ScoredEntry = ScoredTemplate & {
	kind: RecognitionKind;
	entry: DictionaryEntry;
	example: RecognitionExample | null;
};

/** Recognition thresholds derived from app config with defaults applied. */
export interface RecognitionThresholds {
	minConfidence: number;
	ambiguityGap: number;
	contaminationThreshold: number;
	minTemplateCoverage: number;
}

/** How much one stroke group reads as a complete glyph, and which. */
export interface DecompositionMatch {
	/** Shape match discounted for uncovered template ink and an off-size footprint. */
	wholeness: number;
	coveredRatio: number;
	/** Candidate footprint over the entry's regular footprint. */
	sizeRatio: number;
	kind: RecognitionKind;
	id: string | null;
}

/** Cached wholeness scorer used by the stroke-group partition search. */
export interface DecompositionScorer {
	(candidate: SymbolCandidate): DecompositionMatch;
}

export type EntryStrokeTemplate = StrokeTemplate | null;
