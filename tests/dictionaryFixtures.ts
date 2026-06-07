import { readdirSync, readFileSync } from 'node:fs';

import type { Dictionary, SigilEntry, SignEntry } from '../src/lib/types.js';

function readDictionaryDirectory<T>(relativePath: string): T[] {
	const directory = new URL(relativePath, import.meta.url);

	return readdirSync(directory)
		.filter((fileName) => fileName.endsWith('.json'))
		.sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
		.map((fileName) => JSON.parse(readFileSync(new URL(fileName, directory), 'utf8')) as T);
}

export function readRealDictionary(): Dictionary {
	return {
		sigils: readDictionaryDirectory<SigilEntry>('../src/lib/dictionary/sigils/'),
		signs: readDictionaryDirectory<SignEntry>('../src/lib/dictionary/signs/')
	};
}
