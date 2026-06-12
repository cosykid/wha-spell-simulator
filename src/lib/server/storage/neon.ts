import { env } from '$env/dynamic/private';
import { neon } from '@neondatabase/serverless';
import { type ColumnType, type Generated, type GeneratedAlways, Kysely } from 'kysely';
import { NeonDialect } from 'kysely-neon';

import type {
	Label,
	ReviewStatus,
	SampleMeta,
	Stroke as SampleStroke
} from '$lib/structures/labelledSample.js';

/**
 * A `jsonb` column: the Neon driver returns it already parsed (select type `T`),
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

interface GachaProfilesTable {
	discord_username: string;
	currency: ColumnType<number, number, number>;
	inventory: JsonColumn<Record<string, number>>;
	cosmetic_inventory: JsonColumn<Record<string, number>>;
	free_pull_date: ColumnType<string | null, string | null, string | null>;
	cosmetic_free_pull_date: ColumnType<string | null, string | null, string | null>;
	active_ink_color_id: ColumnType<string | null, string | null, string | null>;
	active_effect_id: ColumnType<string | null, string | null, string | null>;
	updated_at: Generated<string>;
}

export interface Database {
	labelled_samples: LabelledSamplesTable;
	gacha_profiles: GachaProfilesTable;
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
