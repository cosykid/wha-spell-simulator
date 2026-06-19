export type {
	ChamferScore,
	InkDistanceMap,
	KnownRecognitionKind,
	NormalizedShape,
	RecognitionExample,
	ShapeMatcherResult,
	ShapeNormalizeOptions
} from './types.js';
export { buildExamplesFromDictionary, recognitionKey } from './examples.js';
export { renderInkDistanceMap, renderNormalizedInk, scoreChamferDistance } from './ink.js';
export {
	normalizeStrokesForShape,
	pointCloudDistance,
	pointCloudDistanceForStrokes
} from './normalization.js';
export { scoreRecognitionExample } from './scoring.js';
