import type { classifyStrokesAgainstRing } from '../coordinateNormalizer.js';
import type { RecognitionExample } from '../shape-matcher/index.js';
import type {
	AppConfig,
	CleanedStroke,
	Dictionary,
	RingInfo,
	Stroke,
	SymbolCandidate
} from '../../types.js';

/** Input accepted by all drawing-classifier entrypoints. */
export interface ClassifyDrawingInput {
	strokes: Stroke[];
	previousRing?: RingInfo | null;
	canvasWidth?: number;
	canvasHeight?: number;
	dictionary: Dictionary;
	config: AppConfig;
	recognitionExamples?: RecognitionExample[];
}

/** Prepared ring/candidate state before final symbol recognition runs. */
export interface RecognitionPrep {
	cleanedStrokes: Stroke[];
	ring: RingInfo;
	classifications: ReturnType<typeof classifyStrokesAgainstRing>;
	candidates: SymbolCandidate[];
}

/** Candidate state for the no-ring preview path. */
export interface NoRingPreview {
	classifications: ReturnType<typeof classifyStrokesAgainstRing>;
	candidates: SymbolCandidate[];
	recognitionDictionary: Dictionary;
	recognitionExamples: RecognitionExample[];
}

/** No-ring prep keeps the preview dictionary used by recognizer calls. */
export interface NoRingRecognitionPrep extends RecognitionPrep {
	recognitionDictionary: Dictionary;
	recognitionExamples: RecognitionExample[];
}

/** Discriminated prep result shared by sync, async, and phased classifiers. */
export type PreparedRecognition = { noRing: NoRingRecognitionPrep } | { prep: RecognitionPrep };

export type CleanedClassifierStroke = CleanedStroke;
