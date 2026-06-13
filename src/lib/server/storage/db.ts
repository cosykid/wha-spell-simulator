import { env } from '$env/dynamic/private';
import {
	type ColumnType,
	type Generated,
	type GeneratedAlways,
	Kysely,
	PostgresDialect
} from 'kysely';
import { Pool, type PoolConfig } from 'pg';

import type {
	Label,
	ReviewStatus,
	SampleMeta,
	Stroke as SampleStroke
} from '$lib/structures/labelledSample.js';

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

export interface Database {
	labelled_samples: LabelledSamplesTable;
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
	return connectionString;
}

/**
 * Maps libpq's `sslmode` query param to a node-postgres TLS config. We resolve it
 * ourselves (instead of leaning on the driver's URL parsing, which has shifted
 * between versions) so the behaviour is explicit:
 * - `disable`/absent → no TLS (local Postgres on a trusted network).
 * - `require`/`prefer` → encrypt, but don't verify the chain (pgbouncer with a
 *   self-signed cert is the common case).
 * - `verify-ca`/`verify-full` → encrypt and enforce the certificate chain.
 */
function sslFor(connectionString: string): PoolConfig['ssl'] {
	const sslmode = connectionString.match(/[?&]sslmode=([^&]+)/)?.[1];
	if (!sslmode || sslmode === 'disable') {
		return false;
	}
	return sslmode === 'verify-ca' || sslmode === 'verify-full'
		? { rejectUnauthorized: true }
		: { rejectUnauthorized: false };
}

export function getDb(connectionString = databaseUrl()): Db {
	if (!cachedDb || cachedConnectionString !== connectionString) {
		cachedConnectionString = connectionString;
		void cachedPool?.end();
		cachedPool = new Pool({
			connectionString,
			ssl: sslFor(connectionString),
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
