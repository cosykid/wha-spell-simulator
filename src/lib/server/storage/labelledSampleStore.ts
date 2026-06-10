import type { LabelledSample, SampleSubmission } from '$lib/structures/labelledSample.js';
import { randomUUID } from 'node:crypto';
import { getDb, type Db } from './neon.js';

/** Thrown when a sample with byte-identical raw strokes already exists. */
export class DuplicateSampleError extends Error {
	constructor(message = 'This sample has already been submitted.') {
		super(message);
		this.name = 'DuplicateSampleError';
	}
}

/** Filters for {@link listLabelledSamples}. Omitting a field matches all values. */
export interface LabelledSampleQuery {
	signId?: string;
	/** Most recent first; capped to keep the verification endpoint cheap. */
	limit?: number;
}

const MAX_LIST_LIMIT = 200;

interface LabelledSampleRow {
	id: string;
	sign_id: string;
	data: LabelledSample['data'];
	label: LabelledSample['label'];
	meta: Omit<LabelledSample['meta'], 'capturedAt'>;
	captured_at: unknown;
}

/** True for a Postgres unique-constraint violation surfaced by the Neon driver. */
function isUniqueViolation(error: unknown): boolean {
	return (
		typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
	);
}

function toIso(value: unknown): string {
	return value instanceof Date ? value.toISOString() : value == null ? '' : String(value);
}

function rowToSample(row: LabelledSampleRow): LabelledSample {
	return {
		id: row.id,
		data: row.data,
		label: row.label,
		meta: { ...row.meta, capturedAt: toIso(row.captured_at) }
	};
}

/**
 * Persists a contributor submission as a {@link LabelledSample}. The server is the
 * authority on `id` and `capturedAt`, so both are assigned here. The strokes are
 * stored RAW - no canonicalization - per the labelled-sample design.
 *
 * @throws {DuplicateSampleError} when identical raw strokes are already on record
 *   (enforced by the `data_hash` unique constraint).
 */
export async function insertLabelledSample(
	submission: SampleSubmission,
	db: Db = getDb()
): Promise<LabelledSample> {
	const id = `sample:${submission.label.signId}:${randomUUID()}`;
	const capturedAt = new Date().toISOString();

	try {
		const row = (await db
			.insertInto('labelled_samples')
			.values({
				id,
				sign_id: submission.label.signId,
				data: JSON.stringify(submission.data),
				label: JSON.stringify(submission.label),
				meta: JSON.stringify(submission.meta),
				captured_at: capturedAt
			})
			.returning(['id', 'sign_id', 'data', 'label', 'meta', 'captured_at'])
			.executeTakeFirstOrThrow()) as LabelledSampleRow;

		return rowToSample(row);
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw new DuplicateSampleError();
		}
		throw error;
	}
}

/** Lists stored samples, most recent first — backs the GET verification endpoint. */
export async function listLabelledSamples(
	query: LabelledSampleQuery = {},
	db: Db = getDb()
): Promise<LabelledSample[]> {
	let builder = db
		.selectFrom('labelled_samples')
		.select(['id', 'sign_id', 'data', 'label', 'meta', 'captured_at'])
		.orderBy('captured_at', 'desc');

	if (query.signId !== undefined) {
		builder = builder.where('sign_id', '=', query.signId);
	}
	const limit = Math.min(query.limit ?? MAX_LIST_LIMIT, MAX_LIST_LIMIT);
	builder = builder.limit(limit);

	const rows = (await builder.execute()) as LabelledSampleRow[];
	return rows.map(rowToSample);
}

/** Total number of stored samples. */
export async function countLabelledSamples(db: Db = getDb()): Promise<number> {
	const row = await db
		.selectFrom('labelled_samples')
		.select((eb) => eb.fn.countAll<string>().as('count'))
		.executeTakeFirstOrThrow();
	return Number(row.count);
}
