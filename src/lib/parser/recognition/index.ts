export type {
	CandidateFeatures,
	DecompositionMatch,
	DecompositionScorer,
	RecognitionThresholds,
	ScoredEntry,
	ScoredTemplate,
	StructuralMatch,
	TemplateFeatures
} from './types.js';
export { createDecompositionScorer } from './decompositionScorer.js';
export { recognizeCandidates } from './recognizeCandidates.js';
