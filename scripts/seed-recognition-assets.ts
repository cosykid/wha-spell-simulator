import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

import { loadDotEnv } from './load-env.js';
import {
	buildExamplesFromDictionary,
	type RecognitionExample
} from '../src/lib/parser/shapeMatcher.js';
import type { Dictionary, SigilEntry, SignEntry } from '../src/lib/types.js';

loadDotEnv();

const connectionString = process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL;

if (!connectionString) {
	throw new Error('Set DATABASE_URL or NEON_DATABASE_URL before seeding recognition assets.');
}

const sql = neon(connectionString);
const dictionaryDir = fileURLToPath(new URL('../src/lib/dictionary', import.meta.url));

function readEntries<T>(folder: string): T[] {
	return readdirSync(join(dictionaryDir, folder))
		.filter((file) => file.endsWith('.json'))
		.sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
		.map((file) => JSON.parse(readFileSync(join(dictionaryDir, folder, file), 'utf8')) as T);
}

function readDictionary(): Dictionary {
	return {
		sigils: readEntries<SigilEntry>('sigils'),
		signs: readEntries<SignEntry>('signs')
	};
}

async function upsertRecognitionExample(example: RecognitionExample): Promise<void> {
	await sql.query(
		`
			insert into recognition_examples (
				id,
				kind,
				symbol_id,
				strokes,
				source,
				rotation_invariant,
				allowed_rotations_deg,
				active,
				metadata
			)
			values ($1, $2, $3, $4::jsonb, $5, $6, $7::int[], true, $8::jsonb)
			on conflict (id) do update set
				kind = excluded.kind,
				symbol_id = excluded.symbol_id,
				strokes = excluded.strokes,
				source = excluded.source,
				rotation_invariant = excluded.rotation_invariant,
				allowed_rotations_deg = excluded.allowed_rotations_deg,
				active = true,
				metadata = excluded.metadata,
				updated_at = now()
		`,
		[
			example.id,
			example.kind,
			example.symbolId,
			JSON.stringify(example.strokes),
			example.source,
			example.rotationInvariant,
			example.allowedRotationsDeg ?? null,
			JSON.stringify({ seededFrom: 'dictionary' })
		]
	);
}

const dictionary = readDictionary();
const examples = buildExamplesFromDictionary(dictionary);

for (const example of examples) {
	await upsertRecognitionExample(example);
}

console.log(`seeded ${examples.length} recognition examples`);
