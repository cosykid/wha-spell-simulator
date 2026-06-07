import { env } from '$env/dynamic/private';
import { neon } from '@neondatabase/serverless';
import { type ColumnType, type Generated, type GeneratedAlways, Kysely } from 'kysely';
import { NeonDialect } from 'kysely-neon';

import type { Label, SampleMeta, Stroke as SampleStroke } from '$lib/structures/labelledSample.js';
import type { Point, RecognitionKind } from '$lib/types.js';

/**
 * A `jsonb` column: the Neon driver returns it already parsed (select type `T`),
 * but params for inserts/updates must be a JSON string — passing an object/array
 * directly would be serialized as a Postgres array/record literal, not JSON.
 */
type JsonColumn<T> = ColumnType<T, string, string>;

interface LabelledSamplesTable {
	id: string;
	sign_id: string;
	schema_version: number;
	data: JsonColumn<SampleStroke[]>;
	label: JsonColumn<Label>;
	meta: JsonColumn<SampleMeta>;
	/** Generated column (md5 of `data`); never inserted or updated. */
	data_hash: GeneratedAlways<string>;
	captured_at: ColumnType<string, string, string>;
	created_at: Generated<string>;
}

interface RecognitionExamplesTable {
	id: string;
	kind: RecognitionKind;
	symbol_id: string;
	strokes: JsonColumn<Point[][]>;
	source: string;
	rotation_invariant: ColumnType<boolean, boolean, boolean>;
	allowed_rotations_deg: ColumnType<number[] | null, number[] | null, number[] | null>;
	active: ColumnType<boolean, boolean | undefined, boolean>;
	created_at: Generated<string>;
	updated_at: ColumnType<string, string | undefined, string>;
}

export interface Database {
	labelled_samples: LabelledSamplesTable;
	recognition_examples: RecognitionExamplesTable;
}

export type Db = Kysely<Database>;

let cachedConnectionString: string | null = null;
let cachedDb: Db | null = null;

export function neonConnectionString(): string {
	const connectionString = env.DATABASE_URL ?? env.NEON_DATABASE_URL;
	if (!connectionString) {
		throw new Error('Set DATABASE_URL or NEON_DATABASE_URL to use Neon Postgres storage.');
	}
	return connectionString;
}

export function getDb(connectionString = neonConnectionString()): Db {
	if (!cachedDb || cachedConnectionString !== connectionString) {
		cachedConnectionString = connectionString;
		cachedDb = new Kysely<Database>({
			dialect: new NeonDialect({ neon: neon(connectionString) })
		});
	}
	return cachedDb;
}
