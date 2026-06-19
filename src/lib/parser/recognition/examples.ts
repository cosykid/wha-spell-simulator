import type { Dictionary } from '../../types.js';
import { buildExamplesFromDictionary, type RecognitionExample } from '../shape-matcher/index.js';

const dictionaryExampleCache = new WeakMap<Dictionary, RecognitionExample[]>();

/**
 * Returns dictionary examples plus optional caller-provided examples.
 *
 * Base dictionary examples are cached by dictionary identity; extra examples
 * override by id so tools can inject fresh labelled samples without duplicating
 * work across a recompute.
 */
export function recognitionExamplesFor(
	dictionary: Dictionary,
	extraExamples: RecognitionExample[] = []
): RecognitionExample[] {
	const baseExamples = (() => {
		const cached = dictionaryExampleCache.get(dictionary);
		if (cached) {
			return cached;
		}
		const built = buildExamplesFromDictionary(dictionary);
		dictionaryExampleCache.set(dictionary, built);
		return built;
	})();

	if (!extraExamples.length) {
		return baseExamples;
	}

	const examples = new Map<string, RecognitionExample>();
	for (const example of baseExamples) {
		examples.set(example.id, example);
	}
	for (const example of extraExamples) {
		examples.set(example.id, example);
	}
	return [...examples.values()];
}
