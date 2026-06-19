import { pathLength } from '../../utils/geometry.js';
import type { Dictionary, DictionaryEntry, RecognitionKind } from '../../types.js';
import { SIMPLIFIED_TEMPLATE_STROKE_MIN_LENGTH } from './constants.js';
import type { KnownRecognitionKind, RecognitionExample } from './types.js';

function exampleFromEntry(
	kind: KnownRecognitionKind,
	entry: DictionaryEntry
): RecognitionExample | null {
	if (!entry.strokeTemplate?.strokes?.length) {
		return null;
	}

	return {
		id: `${kind}:${entry.id}:dictionary-template`,
		kind,
		symbolId: entry.id,
		strokes: entry.strokeTemplate.strokes,
		source: 'dictionary',
		rotationInvariant: entry.recognitionRotationInvariant ?? kind === 'sigil',
		allowedRotationsDeg: entry.allowedRotationsDeg
	};
}

function simplifiedExampleFromEntry(
	kind: KnownRecognitionKind,
	entry: DictionaryEntry
): RecognitionExample | null {
	if (!entry.strokeTemplate?.strokes?.length) {
		return null;
	}

	const simplifiedStrokes = entry.strokeTemplate.strokes.filter(
		(stroke) => pathLength(stroke) >= SIMPLIFIED_TEMPLATE_STROKE_MIN_LENGTH
	);
	if (
		simplifiedStrokes.length < 2 ||
		simplifiedStrokes.length === entry.strokeTemplate.strokes.length
	) {
		return null;
	}

	return {
		id: `${kind}:${entry.id}:dictionary-simplified-template`,
		kind,
		symbolId: entry.id,
		strokes: simplifiedStrokes,
		source: 'dictionary:simplified',
		rotationInvariant: entry.recognitionRotationInvariant ?? kind === 'sigil',
		allowedRotationsDeg: entry.allowedRotationsDeg
	};
}

/** Builds reusable recognition examples from the sigil and sign dictionaries. */
export function buildExamplesFromDictionary(dictionary: Dictionary): RecognitionExample[] {
	return [
		...dictionary.sigils
			.flatMap((entry) => [
				exampleFromEntry('sigil', entry),
				simplifiedExampleFromEntry('sigil', entry)
			])
			.filter((entry): entry is RecognitionExample => Boolean(entry)),
		...dictionary.signs
			.flatMap((entry) => [
				exampleFromEntry('sign', entry),
				simplifiedExampleFromEntry('sign', entry)
			])
			.filter((entry): entry is RecognitionExample => Boolean(entry))
	];
}

/** Stable map key for grouping examples and scores by recognizer identity. */
export function recognitionKey(kind: RecognitionKind, id: string | null | undefined): string {
	return `${kind}:${id ?? 'unknown'}`;
}
