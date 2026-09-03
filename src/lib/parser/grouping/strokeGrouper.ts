import type {
	AppConfig,
	CleanedStroke,
	Dictionary,
	RingInfo,
	SymbolCandidate
} from '../../types.js';
import type { RecognitionExample } from '../shape-matcher/index.js';
import { decomposeWithRecognition, fallbackCandidates } from './decomposition.js';
import type { StrokeClassification } from './types.js';

/**
 * Builds symbol candidates from cleaned strokes and ring-relative classifications.
 *
 * Candidate grouping can run on stroke affinity alone or in recognition-guided
 * mode, where a partition search over scored group hypotheses chooses the
 * final groups.
 */
export function buildSymbolCandidates(
	strokes: CleanedStroke[],
	classifications: StrokeClassification[],
	ring: RingInfo,
	config: AppConfig,
	dictionary?: Dictionary,
	recognitionExamples: RecognitionExample[] = []
): SymbolCandidate[] {
	if (!ring.found) {
		return [];
	}

	if (!dictionary) {
		return fallbackCandidates(strokes, classifications, ring, config);
	}

	if (!config.recognition.recognitionGuidedDecomposition) {
		return fallbackCandidates(strokes, classifications, ring, config);
	}

	return decomposeWithRecognition(
		strokes,
		classifications,
		ring,
		config,
		dictionary,
		recognitionExamples
	);
}
