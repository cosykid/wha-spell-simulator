import type { Dictionary, SampleSpell, SigilEntry, SignEntry } from '../types.js';
import { SymbolRegistry } from './symbolRegistry.js';
import sampleSpells from './sample-spells.json';
import sigilEntries from './sigils/index.js';
import signEntries from './signs/index.js';

// Symbol modules are discovered from the sigils/ and signs/ folders through
// generated index files (scripts/generate-dictionary-indexes.ts), so adding a
// module file is enough to register it. tests/dictionary.test.ts fails when an
// index is stale.
export const sigilRegistry = new SymbolRegistry<SigilEntry>(sigilEntries);
export const signRegistry = new SymbolRegistry<SignEntry>(signEntries);

export const dictionary: Dictionary = Object.freeze({
	sigils: Object.freeze(sigilRegistry.all()),
	signs: Object.freeze(signRegistry.all()),
	sampleSpells: Object.freeze(sampleSpells as SampleSpell[])
});

export function loadDictionary(): Dictionary {
	return dictionary;
}
