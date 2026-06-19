import type { Dictionary, DictionaryEntry, RecognitionKind, SymbolCandidate } from '../../types.js';

/** Resolves an ML class id back to a dictionary entry and recognition kind. */
export function dictionaryEntry(
	dictionary: Dictionary,
	id: string
): { kind: RecognitionKind; entry: DictionaryEntry } | null {
	const sigil = dictionary.sigils.find((entry) => entry.id === id);
	if (sigil) {
		return { kind: 'sigil', entry: sigil };
	}
	const sign = dictionary.signs.find((entry) => entry.id === id);
	if (sign) {
		return { kind: 'sign', entry: sign };
	}
	return null;
}

/** Checks whether an ML entry is allowed on the candidate's detected radial layer. */
export function layerAccepts(entry: DictionaryEntry, candidate: SymbolCandidate): boolean {
	if (candidate.layer === 'any') {
		return true;
	}
	if (!entry.allowedLayers?.length) {
		return candidate.layer !== 'outside';
	}
	return entry.allowedLayers.includes(candidate.layer) || candidate.nearBoundary;
}
