export type {
	CandidateFeatures,
	DecompositionScorer,
	RecognitionThresholds,
	ScoredEntry,
	ScoredTemplate,
	StructuralMatch,
	TemplateFeatures
} from './types.js';
export { createDecompositionScorer } from './scoring.js';
export { recognizeCandidates } from './recognizeCandidates.js';
