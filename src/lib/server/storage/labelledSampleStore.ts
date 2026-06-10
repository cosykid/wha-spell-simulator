import type {
	LabelledSample,
	ReviewStatus,
	SampleSubmission
} from '$lib/structures/labelledSample.js';
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
	/** `'pending'` matches rows without a verdict (`review_status` is null). */
	reviewStatus?: ReviewStatus | 'pending';
	/**
	 * Case-insensitive substring match on the contributor's Discord username. Rows
	 * without a username never match. Trimmed; an empty string matches all values.
	 */
	discordUsername?: string;
	/** Most recent first; capped to keep the verification endpoint cheap. */
	limit?: number;
}

/** Escape a user string for a Postgres `LIKE`/`ILIKE` substring pattern. */
function likePattern(term: string): string {
	const escaped = term.replace(/[\\%_]/g, (char) => `\\${char}`);
	return `%${escaped}%`;
}

const MAX_LIST_LIMIT = 200;

/** Every column needed to build a {@link LabelledSample}. */
const SAMPLE_COLUMNS = [
	'id',
	'sign_id',
	'data',
	'label',
	'meta',
	'captured_at',
	'review_status',
	'reviewed_at'
] as const;

interface LabelledSampleRow {
	id: string;
	sign_id: string;
	data: LabelledSample['data'];
	label: LabelledSample['label'];
	meta: Omit<LabelledSample['meta'], 'capturedAt'>;
	captured_at: unknown;
	review_status: ReviewStatus | null;
	reviewed_at: unknown;
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
		meta: { ...row.meta, capturedAt: toIso(row.captured_at) },
		review: row.review_status
			? { status: row.review_status, reviewedAt: toIso(row.reviewed_at) }
			: null
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
				// Mirror the handle out of `meta` for searching; blank → null.
				discord_username: submission.meta.discordUsername?.trim() || null,
				captured_at: capturedAt
			})
			.returning(SAMPLE_COLUMNS)
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
		.select(SAMPLE_COLUMNS)
		.orderBy('captured_at', 'desc');

	if (query.signId !== undefined) {
		builder = builder.where('sign_id', '=', query.signId);
	}
	if (query.reviewStatus === 'pending') {
		builder = builder.where('review_status', 'is', null);
	} else if (query.reviewStatus !== undefined) {
		builder = builder.where('review_status', '=', query.reviewStatus);
	}
	const username = query.discordUsername?.trim();
	if (username) {
		builder = builder.where('discord_username', 'ilike', likePattern(username));
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

/**
 * Records a manual QA verdict on a stored sample, or clears it (`null` → back to
 * pending). A verdict only marks the row — rejected samples are never deleted, so
 * they stay inspectable and the verdict can be revised. Returns the updated sample,
 * or `null` when the id is unknown.
 */
export async function setSampleReviewStatus(
	id: string,
	status: ReviewStatus | null,
	db: Db = getDb()
): Promise<LabelledSample | null> {
	const row = (await db
		.updateTable('labelled_samples')
		.set({
			review_status: status,
			reviewed_at: status === null ? null : new Date().toISOString()
		})
		.where('id', '=', id)
		.returning(SAMPLE_COLUMNS)
		.executeTakeFirst()) as LabelledSampleRow | undefined;
	return row ? rowToSample(row) : null;
}

/** Sample tallies per review state, for the reviewer's progress display. */
export interface ReviewCounts {
	pending: number;
	approved: number;
	rejected: number;
}

export async function countSamplesByReviewStatus(db: Db = getDb()): Promise<ReviewCounts> {
	const rows = (await db
		.selectFrom('labelled_samples')
		.select((eb) => ['review_status', eb.fn.countAll<string>().as('count')])
		.groupBy('review_status')
		.execute()) as { review_status: ReviewStatus | null; count: string }[];

	const counts: ReviewCounts = { pending: 0, approved: 0, rejected: 0 };
	for (const row of rows) {
		counts[row.review_status ?? 'pending'] = Number(row.count);
	}
	return counts;
}

/** One contributor's drawing tally, for the Leaderboard tool. */
export interface ContributorTally {
	/** Self-reported Discord handle, or `null` for samples submitted without one. */
	discordUsername: string | null;
	/** Total samples this contributor submitted. */
	total: number;
	/** Of those, how many a reviewer has approved. */
	approved: number;
	/** Of those, how many a reviewer has rejected. */
	rejected: number;
}

/** Filters for {@link tallyContributors}. Omitting a field matches all values. */
export interface ContributorTallyQuery {
	/** Restrict the tally to one sign id (for per-sign rankings). */
	signId?: string;
}

/**
 * Sample tallies grouped by Discord username, for the Leaderboard. Submissions left
 * without a handle share the `null` bucket (Postgres groups NULLs together). Each row
 * carries the contributor's total submissions and the subset that were approved.
 * Pass `signId` to rank a single sign instead of all drawings.
 */
export async function tallyContributors(
	query: ContributorTallyQuery = {},
	db: Db = getDb()
): Promise<ContributorTally[]> {
	let builder = db
		.selectFrom('labelled_samples')
		.select((eb) => [
			'discord_username',
			eb.fn.countAll<string>().as('total'),
			eb.fn.countAll<string>().filterWhere('review_status', '=', 'approved').as('approved'),
			eb.fn.countAll<string>().filterWhere('review_status', '=', 'rejected').as('rejected')
		])
		.groupBy('discord_username');

	if (query.signId !== undefined) {
		builder = builder.where('sign_id', '=', query.signId);
	}

	const rows = (await builder.execute()) as {
		discord_username: string | null;
		total: string;
		approved: string;
		rejected: string;
	}[];

	return rows.map((row) => ({
		discordUsername: row.discord_username,
		total: Number(row.total),
		approved: Number(row.approved),
		rejected: Number(row.rejected)
	}));
}

/** One sign's drawing tally, for the Signs leaderboard. */
export interface SignTally {
	signId: string;
	/** Total samples drawn for this sign. */
	total: number;
	/** Of those, how many a reviewer has approved. */
	approved: number;
	/** Of those, how many a reviewer has rejected. */
	rejected: number;
}

/** Filters for {@link tallySigns}. Omitting a field matches all values. */
export interface SignTallyQuery {
	/**
	 * Case-insensitive substring match on the contributor's Discord username; when set,
	 * counts only that contributor's samples (their personal per-sign breakdown).
	 */
	discordUsername?: string;
}

/**
 * Sample tallies grouped by sign id, for the Signs leaderboard — how much each sign has
 * been drawn. Pass `discordUsername` to scope the counts to one contributor instead of
 * everyone.
 */
export async function tallySigns(
	query: SignTallyQuery = {},
	db: Db = getDb()
): Promise<SignTally[]> {
	let builder = db
		.selectFrom('labelled_samples')
		.select((eb) => [
			'sign_id',
			eb.fn.countAll<string>().as('total'),
			eb.fn.countAll<string>().filterWhere('review_status', '=', 'approved').as('approved'),
			eb.fn.countAll<string>().filterWhere('review_status', '=', 'rejected').as('rejected')
		])
		.groupBy('sign_id');

	const username = query.discordUsername?.trim();
	if (username) {
		builder = builder.where('discord_username', 'ilike', likePattern(username));
	}

	const rows = (await builder.execute()) as {
		sign_id: string;
		total: string;
		approved: string;
		rejected: string;
	}[];

	return rows.map((row) => ({
		signId: row.sign_id,
		total: Number(row.total),
		approved: Number(row.approved),
		rejected: Number(row.rejected)
	}));
}

/** Distinct sign ids present in stored samples, sorted — backs the Leaderboard sign filter. */
export async function listSampleSignIds(db: Db = getDb()): Promise<string[]> {
	const rows = (await db
		.selectFrom('labelled_samples')
		.select('sign_id')
		.distinct()
		.orderBy('sign_id')
		.execute()) as { sign_id: string }[];
	return rows.map((row) => row.sign_id);
}
