import { env } from '$env/dynamic/private';
import {
	type ColumnType,
	type Generated,
	type GeneratedAlways,
	Kysely,
	PostgresDialect
} from 'kysely';
import { Pool } from 'pg';

import type {
	Label,
	ReviewStatus,
	SampleMeta,
	Stroke as SampleStroke
} from '$lib/structures/labelledSample.js';
import type { SpellPresetData } from '$lib/structures/spellPreset.js';
import type { SpellIR } from '$lib/types.js';
import { normalizePostgresConnectionString, sslFor } from './postgresConnection.js';

/**
 * A `jsonb` column: node-postgres returns it already parsed (select type `T`),
 * but params for inserts/updates must be a JSON string — passing an object/array
 * directly would be serialized as a Postgres array/record literal, not JSON.
 */
type JsonColumn<T> = ColumnType<T, string, string>;

interface LabelledSamplesTable {
	id: string;
	sign_id: string;
	data: JsonColumn<SampleStroke[]>;
	label: JsonColumn<Label>;
	meta: JsonColumn<SampleMeta>;
	/** Generated column (md5 of `data`); never inserted or updated. */
	data_hash: GeneratedAlways<string>;
	captured_at: ColumnType<string, string, string>;
	created_at: Generated<string>;
	/** Manual QA verdict; null = not reviewed yet. Never set on insert. */
	review_status: ColumnType<ReviewStatus | null, never, ReviewStatus | null>;
	reviewed_at: ColumnType<string | null, never, string | null>;
	/**
	 * Optional self-reported contributor handle, mirrored from `meta.discordUsername`
	 * on insert so the reviewer can search it directly. Null when left blank.
	 */
	discord_username: ColumnType<string | null, string | null, string | null>;
}

interface UsersTable {
	id: string;
	username: string;
	password_hash: string;
	created_at: Generated<string>;
}

interface SessionsTable {
	/** SHA-256 hex of the bearer token. The raw token only ever lives in the cookie. */
	token_hash: string;
	user_id: string;
	expires_at: ColumnType<string, string, string>;
	created_at: Generated<string>;
}

interface SpellsTable {
	id: string;
	user_id: string;
	name: string;
	data: JsonColumn<SpellPresetData>;
	/** Compiled SpellIR captured at save time, for library previews. Null when invalid. */
	preview_ir: ColumnType<SpellIR | null, string | null, string | null>;
	element: ColumnType<string | null, string | null, string | null>;
	/** Null while private. Set when the owner publishes to the shared library. */
	published_at: ColumnType<string | null, string | null, string | null>;
	/** Denormalized tally, updated in the same transaction as spell_upvotes rows. */
	upvote_count: Generated<number>;
	created_at: Generated<string>;
	updated_at: ColumnType<string, string | undefined, string>;
}

interface SpellUpvotesTable {
	spell_id: string;
	user_id: string;
	created_at: Generated<string>;
}

export interface Database {
	labelled_samples: LabelledSamplesTable;
	users: UsersTable;
	sessions: SessionsTable;
	spells: SpellsTable;
	spell_upvotes: SpellUpvotesTable;
}

export type Db = Kysely<Database>;

let cachedConnectionString: string | null = null;
let cachedDb: Db | null = null;
let cachedPool: Pool | null = null;

export function databaseUrl(): string {
	const connectionString = env.DATABASE_URL_VPS;
	if (!connectionString) {
		throw new Error('Set DATABASE_URL_VPS to use Postgres storage.');
	}
	return normalizePostgresConnectionString(connectionString);
}

export function getDb(connectionString = databaseUrl()): Db {
	const normalizedConnectionString = normalizePostgresConnectionString(connectionString);
	if (!cachedDb || cachedConnectionString !== normalizedConnectionString) {
		cachedConnectionString = normalizedConnectionString;
		void cachedPool?.end();
		cachedPool = new Pool({
			connectionString: normalizedConnectionString,
			ssl: sslFor(normalizedConnectionString),
			// pgbouncer (transaction mode) multiplexes the real Postgres connections,
			// so keep each serverless instance's pool small to avoid piling up clients
			// on the pooler. Override with PG_POOL_MAX if needed.
			max: Number(env.PG_POOL_MAX ?? 5),
			// Vercel functions are short-lived; reap idle clients quickly.
			idleTimeoutMillis: 10_000,
			connectionTimeoutMillis: 10_000
		});
		cachedDb = new Kysely<Database>({
			dialect: new PostgresDialect({ pool: cachedPool })
		});
	}
	return cachedDb;
}
