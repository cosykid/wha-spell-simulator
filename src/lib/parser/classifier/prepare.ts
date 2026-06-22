import { cleanStrokes } from '../strokeCleaner.js';
import { detectRing } from '../rings/index.js';
import { classifyStrokesAgainstRing } from '../coordinateNormalizer.js';
import { buildSymbolCandidates } from '../grouping/index.js';
import { noRingPreview } from './noRingPreview.js';
import type { ClassifyDrawingInput, PreparedRecognition } from './types.js';

/** Runs cleaning, ring detection, stroke classification, and candidate grouping. */
export function prepareRecognition(input: ClassifyDrawingInput): PreparedRecognition {
	const {
		strokes,
		previousRing = null,
		canvasWidth,
		canvasHeight,
		guideReferenceSize,
		dictionary,
		config,
		recognitionExamples = []
	} = input;
	const cleanedStrokes = cleanStrokes(strokes, config);
	const ring = detectRing(cleanedStrokes, previousRing, config);

	if (!ring.found) {
		const guideSize =
			typeof guideReferenceSize === 'number' && Number.isFinite(guideReferenceSize)
				? guideReferenceSize
				: Math.min(canvasWidth ?? 0, canvasHeight ?? 0);
		const guideRing =
			canvasWidth && canvasHeight && guideSize > 0
				? {
						found: true,
						complete: false,
						center: { x: canvasWidth / 2, y: canvasHeight / 2 },
						radius: guideSize * 0.36,
						strokeIds: [] as string[]
					}
				: null;
		const preview = noRingPreview(
			cleanedStrokes,
			dictionary,
			config,
			recognitionExamples,
			guideRing
		);
		return {
			noRing: {
				cleanedStrokes,
				ring,
				candidates: preview.candidates,
				classifications: preview.classifications,
				recognitionDictionary: preview.recognitionDictionary,
				recognitionExamples: preview.recognitionExamples
			}
		};
	}

	const classifications = classifyStrokesAgainstRing(cleanedStrokes, ring, config);
	const decompositionDictionary = ring.complete ? dictionary : undefined;
	const candidates = buildSymbolCandidates(
		cleanedStrokes,
		classifications,
		ring,
		config,
		decompositionDictionary
	);

	return { prep: { cleanedStrokes, ring, classifications, candidates } };
}
