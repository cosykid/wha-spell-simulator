import { sql } from 'kysely';

import { buildExamplesFromDictionary, type RecognitionExample } from '../../parser/shapeMatcher.js';
import type { Dictionary, Point, RecognitionKind } from '../../types.js';
import { getDb, type Db } from './neon.js';

interface RecognitionExampleRow {
	id: string;
	kind: RecognitionKind;
	symbol_id: string;
	strokes: Point[][];
	source: string;
	rotation_invariant: boolean;
	allowed_rotations_deg: number[] | null;
}

interface RecognitionExampleDetailRow extends RecognitionExampleRow {
	active: boolean;
	created_at: unknown;
	updated_at: unknown;
}

/** A stored recognition example plus its lifecycle metadata (for the management API). */
export interface RecognitionExampleRecord extends RecognitionExample {
	active: boolean;
	/** ISO-8601 timestamps. */
	createdAt: string;
	updatedAt: string;
}

/** Filters for {@link queryRecognitionExamples}. Omitting a field matches all values. */
export interface RecognitionExampleQuery {
	kind?: RecognitionKind;
	symbolId?: string;
	source?: string;
	/** Omit to include both active and inactive rows. */
	active?: boolean;
}

const SUMMARY_COLUMNS = [
	'id',
	'kind',
	'symbol_id',
	'strokes',
	'source',
	'rotation_invariant',
	'allowed_rotations_deg'
] as const;

const DETAIL_COLUMNS = [...SUMMARY_COLUMNS, 'active', 'created_at', 'updated_at'] as const;

function toIso(value: unknown): string {
	if (value instanceof Date) {
		return value.toISOString();
	}
	return value == null ? '' : String(value);
}

function rowToExample(row: RecognitionExampleRow): RecognitionExample {
	if (row.kind !== 'sigil' && row.kind !== 'sign') {
		throw new Error(`Unsupported recognition example kind: ${row.kind}`);
	}

	return {
		id: row.id,
		kind: row.kind,
		symbolId: row.symbol_id,
		strokes: row.strokes,
		source: row.source,
		rotationInvariant: row.rotation_invariant,
		allowedRotationsDeg: row.allowed_rotations_deg ?? undefined
	};
}

function rowToRecord(row: RecognitionExampleDetailRow): RecognitionExampleRecord {
	return {
		...rowToExample(row),
		active: row.active,
		createdAt: toIso(row.created_at),
		updatedAt: toIso(row.updated_at)
	};
}

export async function listRecognitionExamples(db: Db = getDb()): Promise<RecognitionExample[]> {
	const rows = (await db
		.selectFrom('recognition_examples')
		.select(SUMMARY_COLUMNS)
		.where('active', '=', true)
		.orderBy('source')
		.orderBy('kind')
		.orderBy('symbol_id')
		.orderBy('id')
		.execute()) as RecognitionExampleRow[];

	return rows.map(rowToExample);
}

/**
 * Reads examples with their lifecycle metadata, optionally filtered. Unlike
 * {@link listRecognitionExamples}, this includes inactive rows unless the query
 * narrows `active`, so the management API can surface the full corpus.
 */
export async function queryRecognitionExamples(
	query: RecognitionExampleQuery = {},
	db: Db = getDb()
): Promise<RecognitionExampleRecord[]> {
	let builder = db
		.selectFrom('recognition_examples')
		.select(DETAIL_COLUMNS)
		.orderBy('source')
		.orderBy('kind')
		.orderBy('symbol_id')
		.orderBy('id');

	if (query.kind !== undefined) {
		builder = builder.where('kind', '=', query.kind);
	}
	if (query.symbolId !== undefined) {
		builder = builder.where('symbol_id', '=', query.symbolId);
	}
	if (query.source !== undefined) {
		builder = builder.where('source', '=', query.source);
	}
	if (query.active !== undefined) {
		builder = builder.where('active', '=', query.active);
	}

	const rows = (await builder.execute()) as RecognitionExampleDetailRow[];
	return rows.map(rowToRecord);
}

/** Fetches a single example (active or not) by id, or null when it does not exist. */
export async function getRecognitionExample(
	id: string,
	db: Db = getDb()
): Promise<RecognitionExampleRecord | null> {
	const row = (await db
		.selectFrom('recognition_examples')
		.select(DETAIL_COLUMNS)
		.where('id', '=', id)
		.executeTakeFirst()) as RecognitionExampleDetailRow | undefined;

	return row ? rowToRecord(row) : null;
}

/**
 * Soft-deletes an example by flipping `active` to false. Returns true when a row
 * was updated, false when no example with that id exists.
 */
export async function deactivateRecognitionExample(id: string, db: Db = getDb()): Promise<boolean> {
	const row = await db
		.updateTable('recognition_examples')
		.set({ active: false, updated_at: sql`now()` })
		.where('id', '=', id)
		.returning('id')
		.executeTakeFirst();

	return row !== undefined;
}

export async function upsertRecognitionExamples(
	examples: RecognitionExample[],
	db: Db = getDb()
): Promise<void> {
	if (examples.length === 0) {
		return;
	}

	await db
		.insertInto('recognition_examples')
		.values(
			examples.map((example) => ({
				id: example.id,
				kind: example.kind,
				symbol_id: example.symbolId,
				strokes: JSON.stringify(example.strokes),
				source: example.source,
				rotation_invariant: example.rotationInvariant,
				allowed_rotations_deg: example.allowedRotationsDeg ?? null,
				active: true
			}))
		)
		.onConflict((oc) =>
			oc.column('id').doUpdateSet((eb) => ({
				kind: eb.ref('excluded.kind'),
				symbol_id: eb.ref('excluded.symbol_id'),
				strokes: eb.ref('excluded.strokes'),
				source: eb.ref('excluded.source'),
				rotation_invariant: eb.ref('excluded.rotation_invariant'),
				allowed_rotations_deg: eb.ref('excluded.allowed_rotations_deg'),
				active: true,
				updated_at: sql`now()`
			}))
		)
		.execute();
}

export async function seedDictionaryRecognitionExamples(
	dictionary: Dictionary,
	db: Db = getDb()
): Promise<void> {
	await upsertRecognitionExamples(buildExamplesFromDictionary(dictionary), db);
}
