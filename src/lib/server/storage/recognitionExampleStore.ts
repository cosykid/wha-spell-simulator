import { buildExamplesFromDictionary, type RecognitionExample } from '../../parser/shapeMatcher.js';
import type { Dictionary, Point, RecognitionKind } from '../../types.js';
import { getNeonSql, type NeonSql } from './neon.js';

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

const DETAIL_COLUMNS = `
	id,
	kind,
	symbol_id,
	strokes,
	source,
	rotation_invariant,
	allowed_rotations_deg,
	active,
	created_at,
	updated_at
`;

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

export async function listRecognitionExamples(
	sql: NeonSql = getNeonSql()
): Promise<RecognitionExample[]> {
	const rows = (await sql.query(
		`
			select id,
			       kind,
			       symbol_id,
			       strokes,
			       source,
			       rotation_invariant,
			       allowed_rotations_deg
			from recognition_examples
			where active = true
			order by source, kind, symbol_id, id
		`
	)) as RecognitionExampleRow[];

	return rows.map(rowToExample);
}

/**
 * Reads examples with their lifecycle metadata, optionally filtered. Unlike
 * {@link listRecognitionExamples}, this includes inactive rows unless the query
 * narrows `active`, so the management API can surface the full corpus.
 */
export async function queryRecognitionExamples(
	query: RecognitionExampleQuery = {},
	sql: NeonSql = getNeonSql()
): Promise<RecognitionExampleRecord[]> {
	const conditions: string[] = [];
	const params: unknown[] = [];

	if (query.kind !== undefined) {
		params.push(query.kind);
		conditions.push(`kind = $${params.length}`);
	}
	if (query.symbolId !== undefined) {
		params.push(query.symbolId);
		conditions.push(`symbol_id = $${params.length}`);
	}
	if (query.source !== undefined) {
		params.push(query.source);
		conditions.push(`source = $${params.length}`);
	}
	if (query.active !== undefined) {
		params.push(query.active);
		conditions.push(`active = $${params.length}`);
	}

	const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
	const rows = (await sql.query(
		`select ${DETAIL_COLUMNS} from recognition_examples ${where} order by source, kind, symbol_id, id`,
		params
	)) as RecognitionExampleDetailRow[];

	return rows.map(rowToRecord);
}

/** Fetches a single example (active or not) by id, or null when it does not exist. */
export async function getRecognitionExample(
	id: string,
	sql: NeonSql = getNeonSql()
): Promise<RecognitionExampleRecord | null> {
	const rows = (await sql.query(
		`select ${DETAIL_COLUMNS} from recognition_examples where id = $1`,
		[id]
	)) as RecognitionExampleDetailRow[];

	return rows.length ? rowToRecord(rows[0]) : null;
}

/**
 * Soft-deletes an example by flipping `active` to false. Returns true when a row
 * was updated, false when no example with that id exists.
 */
export async function deactivateRecognitionExample(
	id: string,
	sql: NeonSql = getNeonSql()
): Promise<boolean> {
	const rows = (await sql.query(
		`update recognition_examples set active = false, updated_at = now() where id = $1 returning id`,
		[id]
	)) as { id: string }[];

	return rows.length > 0;
}

export async function upsertRecognitionExamples(
	examples: RecognitionExample[],
	sql: NeonSql = getNeonSql()
): Promise<void> {
	for (const example of examples) {
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
					active
				)
				values ($1, $2, $3, $4::jsonb, $5, $6, $7::int[], true)
				on conflict (id) do update set
					kind = excluded.kind,
					symbol_id = excluded.symbol_id,
					strokes = excluded.strokes,
					source = excluded.source,
					rotation_invariant = excluded.rotation_invariant,
					allowed_rotations_deg = excluded.allowed_rotations_deg,
					active = true,
					updated_at = now()
			`,
			[
				example.id,
				example.kind,
				example.symbolId,
				JSON.stringify(example.strokes),
				example.source,
				example.rotationInvariant,
				example.allowedRotationsDeg ?? null
			]
		);
	}
}

export async function seedDictionaryRecognitionExamples(
	dictionary: Dictionary,
	sql: NeonSql = getNeonSql()
): Promise<void> {
	await upsertRecognitionExamples(buildExamplesFromDictionary(dictionary), sql);
}
