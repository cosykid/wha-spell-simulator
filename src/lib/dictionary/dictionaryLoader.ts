import type { Dictionary, SigilEntry, SignEntry, SampleSpell } from '../types.js';
import sampleSpells from './sample-spells.json';

const sigilModules = import.meta.glob<SigilEntry>('./sigils/*.json', {
	eager: true,
	import: 'default'
});
const signModules = import.meta.glob<SignEntry>('./signs/*.json', {
	eager: true,
	import: 'default'
});

function dictionaryEntries<T>(modules: Record<string, T>): T[] {
	return Object.keys(modules)
		.sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
		.map((path) => modules[path]);
}

export async function loadDictionary(): Promise<Dictionary> {
	return {
		sigils: dictionaryEntries(sigilModules),
		signs: dictionaryEntries(signModules),
		sampleSpells: sampleSpells as SampleSpell[]
	};
}
