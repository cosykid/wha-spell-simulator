import { emitMlDebug } from '../../debug/mlDebug.js';
import { recognizeCandidatesAsync } from '../recognitionPool.js';
import type { ClassifiedDrawing } from '../../types.js';
import { assembleDrawing, assembleNoRingDrawing, assemblePreparedDrawing } from './assembly.js';
import { prepareRecognition } from './prepare.js';
import { hybridMlRecognitionsFor, templateRecognitionsFor } from './recognitionPass.js';
import type { ClassifyDrawingInput } from './types.js';

const ML_START_DEBOUNCE_MS = 100;

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Synchronously classifies a drawing with the deterministic template recognizer. */
export function classifyDrawing(input: ClassifyDrawingInput): ClassifiedDrawing {
	const prepared = prepareRecognition(input);
	const recognitions = templateRecognitionsFor(prepared, input);
	return assemblePreparedDrawing(prepared, recognitions, input.config);
}

/**
 * Emits a template result immediately, then returns a final result after optional ML refinement.
 *
 * `shouldContinue` lets callers cheaply cancel stale async passes while the user
 * is still drawing.
 */
export async function classifyDrawingPhasedLocal(
	input: ClassifyDrawingInput,
	onTemplateResult?: (result: ClassifiedDrawing) => void,
	shouldContinue?: () => boolean,
	onMlProgress?: (result: ClassifiedDrawing) => void
): Promise<ClassifiedDrawing | null> {
	const prepared = prepareRecognition(input);
	const templateResults = templateRecognitionsFor(prepared, input);
	const templateDrawing = assemblePreparedDrawing(prepared, templateResults, input.config);
	onTemplateResult?.(templateDrawing);

	if (shouldContinue && !shouldContinue()) {
		return null;
	}

	await delay(ML_START_DEBOUNCE_MS);
	if (shouldContinue && !shouldContinue()) {
		return null;
	}

	const hybridResults = await hybridMlRecognitionsFor(
		prepared,
		templateResults,
		input,
		shouldContinue,
		(progressResults) => {
			if (!shouldContinue || shouldContinue()) {
				onMlProgress?.(assemblePreparedDrawing(prepared, progressResults, input.config));
			}
		}
	);
	if (shouldContinue && !shouldContinue()) {
		return null;
	}
	return assemblePreparedDrawing(prepared, hybridResults, input.config);
}

/**
 * Classifies a drawing using the worker-backed recognition pool when possible.
 *
 * Prep remains local because recognition dominates cost; worker fallback returns
 * the same shape as `classifyDrawing`.
 */
export async function classifyDrawingAsync(
	input: ClassifyDrawingInput
): Promise<ClassifiedDrawing> {
	const prepared = prepareRecognition(input);
	if ('noRing' in prepared) {
		emitMlDebug(
			'drawingClassifier',
			'classifier no-ring candidates',
			{ candidates: prepared.noRing.candidates.length },
			input.config.recognition.ml.debug
		);
		const recognitions = await recognizeCandidatesAsync(
			prepared.noRing.candidates,
			prepared.noRing.recognitionDictionary,
			input.config,
			prepared.noRing.recognitionExamples
		);
		return assembleNoRingDrawing(prepared.noRing, recognitions, input.config);
	}

	emitMlDebug(
		'drawingClassifier',
		'classifier ring candidates',
		{ candidates: prepared.prep.candidates.length },
		input.config.recognition.ml.debug
	);
	const recognitions = await recognizeCandidatesAsync(
		prepared.prep.candidates,
		input.dictionary,
		input.config,
		input.recognitionExamples ?? []
	);
	return assembleDrawing(prepared.prep, recognitions, input.config);
}

export type { ClassifyDrawingInput } from './types.js';
