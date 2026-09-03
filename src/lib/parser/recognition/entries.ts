/**
 * @file Dictionary entries paired with the recognition examples that back them.
 * An entry without an example is invisible to the template recognizer.
 */
import { recognitionKey, type RecognitionExample } from '../shape-matcher/index.js';
import type { Dictionary, DictionaryEntry, RecognitionKind } from '../../types.js';

export interface RecognitionEntry {
	kind: RecognitionKind;
	entry: DictionaryEntry;
	examples: RecognitionExample[];
}

export function examplesByRecognitionKey(
	examples: RecognitionExample[]
): Map<string, RecognitionExample[]> {
	const byKey = new Map<string, RecognitionExample[]>();
	for (const example of examples) {
		const key = recognitionKey(example.kind, example.symbolId);
		byKey.set(key, [...(byKey.get(key) ?? []), example]);
	}
	return byKey;
}

/** Sigil entries first, then sign entries, each with its examples. */
export function recognitionEntriesFor(
	dictionary: Dictionary,
	examplesByKey: Map<string, RecognitionExample[]>
): RecognitionEntry[] {
	return [
		...dictionary.sigils.flatMap((entry) => {
			const examples = examplesByKey.get(recognitionKey('sigil', entry.id)) ?? [];
			return examples.length ? [{ kind: 'sigil' as const, entry, examples }] : [];
		}),
		...dictionary.signs.flatMap((entry) => {
			const examples = examplesByKey.get(recognitionKey('sign', entry.id)) ?? [];
			return examples.length ? [{ kind: 'sign' as const, entry, examples }] : [];
		})
	];
}
