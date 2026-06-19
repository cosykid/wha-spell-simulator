import { recognizeCandidatesHybridMl } from '../ml/index.js';
import { recognizeCandidates } from '../recognition/index.js';
import type { RecognizedSymbol } from '../../types.js';
import type { ClassifyDrawingInput, PreparedRecognition } from './types.js';

/** Runs the deterministic template recognizer for prepared candidates. */
export function templateRecognitionsFor(
	prepared: PreparedRecognition,
	input: ClassifyDrawingInput
): RecognizedSymbol[] {
	if ('noRing' in prepared) {
		return recognizeCandidates(
			prepared.noRing.candidates,
			prepared.noRing.recognitionDictionary,
			input.config,
			prepared.noRing.recognitionExamples
		);
	}

	return recognizeCandidates(
		prepared.prep.candidates,
		input.dictionary,
		input.config,
		input.recognitionExamples ?? []
	);
}

/** Runs hybrid ML refinement for prepared candidates. */
export async function hybridMlRecognitionsFor(
	prepared: PreparedRecognition,
	templateResults: RecognizedSymbol[],
	input: ClassifyDrawingInput,
	shouldContinue?: () => boolean,
	onProgress?: (recognitions: RecognizedSymbol[]) => void
): Promise<RecognizedSymbol[]> {
	if ('noRing' in prepared) {
		return recognizeCandidatesHybridMl(
			prepared.noRing.candidates,
			templateResults,
			prepared.noRing.recognitionDictionary,
			input.config,
			shouldContinue,
			onProgress
		);
	}

	return recognizeCandidatesHybridMl(
		prepared.prep.candidates,
		templateResults,
		input.dictionary,
		input.config,
		shouldContinue,
		onProgress
	);
}
