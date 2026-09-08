/**
 * @file Saved spell rows: each user's presets, the published subset that forms
 * the shared library, and the upvote tallies that rank it. The `upvote_count`
 * column is denormalized and only ever changes in the same transaction as its
 * `spell_upvotes` row, so the two cannot drift.
 *
 * Listing a spell and opening one are separate reads. A list selects the card
 * columns only, never `data` or `preview_ir`, so a page of twenty costs
 * kilobytes instead of the megabyte those two weigh; {@link getSpellDetail}
 * fetches the drawing for the one spell a reader acts on.
 */
import { randomUUID } from 'node:crypto';
import { sql, type SqlBool } from 'kysely';

import type {
	LibraryCard,
	LibraryPage,
	LibrarySort,
	SpellCard,
	SpellDetail
} from '$lib/structures/savedSpell.js';
import type { SpellPresetData } from '$lib/structures/spellPreset.js';
import { buildSpellThumbnail, toSpellThumbnail } from '$lib/structures/spellThumbnail.js';
import type { SpellIR } from '$lib/types.js';
import { getDb, type Db } from './db.js';

export interface LibraryQuery {
	sort: LibrarySort;
	limit?: number;
	/** Opaque cursor from a previous page's `nextCursor`. */
	cursor?: string | null;
}

export interface SpellDraft {
	userId: string;
	name: string;
	data: SpellPresetData;
	previewIr: SpellIR | null;
	element: string | null;
}

const MAX_PAGE_SIZE = 40;
const DEFAULT_PAGE_SIZE = 20;

/**
 * Everything a plate draws. `data` and `preview_ir` are deliberately absent:
 * whether the stored IR can drive a replay is read out of it in Postgres so the
 * blob itself never crosses the wire.
 */
const CARD_COLUMNS = [
	'spells.id',
	'spells.name',
	'spells.element',
	'spells.thumbnail',
	'spells.published_at',
	'spells.upvote_count',
	'spells.updated_at'
] as const;

const canPreviewColumn = sql<boolean>`coalesce((spells.preview_ir->>'valid')::boolean, false)`;

interface CardRow {
	id: string;
	name: string;
	element: string | null;
	thumbnail: unknown;
	can_preview: boolean;
	published_at: unknown;
	upvote_count: number;
	updated_at: unknown;
}

function toIso(value: unknown): string {
	return value instanceof Date ? value.toISOString() : value == null ? '' : String(value);
}

function rowToCard(row: CardRow): SpellCard {
	return {
		id: row.id,
		name: row.name,
		element: row.element,
		thumbnail: toSpellThumbnail(row.thumbnail),
		canPreview: Boolean(row.can_preview),
		publishedAt: row.published_at == null ? null : toIso(row.published_at),
		upvoteCount: row.upvote_count,
		updatedAt: toIso(row.updated_at)
	};
}

interface LibraryCursor {
	upvotes?: number;
	publishedAt: string;
	id: string;
}

function encodeCursor(cursor: LibraryCursor): string {
	return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(raw: string | null | undefined): LibraryCursor | null {
	if (!raw) {
		return null;
	}
	try {
		const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString()) as LibraryCursor;
		return typeof parsed.publishedAt === 'string' && typeof parsed.id === 'string' ? parsed : null;
	} catch {
		return null;
	}
}

export async function insertSpell(draft: SpellDraft, db: Db = getDb()): Promise<SpellCard> {
	const row = (await db
		.insertInto('spells')
		.values({
			id: `spell:${randomUUID()}`,
			user_id: draft.userId,
			name: draft.name,
			data: JSON.stringify(draft.data),
			preview_ir: draft.previewIr ? JSON.stringify(draft.previewIr) : null,
			thumbnail: JSON.stringify(buildSpellThumbnail(draft.data)),
			element: draft.element
		})
		.returning([...CARD_COLUMNS, canPreviewColumn.as('can_preview')])
		.executeTakeFirstOrThrow()) as CardRow;
	return rowToCard(row);
}

/** The owner's spells, newest change first, for the grimoire and drawer list. */
export async function listSpellsByOwner(userId: string, db: Db = getDb()): Promise<SpellCard[]> {
	const rows = (await db
		.selectFrom('spells')
		.select([...CARD_COLUMNS, canPreviewColumn.as('can_preview')])
		.where('user_id', '=', userId)
		.orderBy('updated_at', 'desc')
		.orderBy('id', 'desc')
		.execute()) as CardRow[];
	return rows.map(rowToCard);
}

/**
 * The drawing behind one card, for casting or replaying it. Readable when the
 * spell is published, or by its owner while it is still private.
 *
 * `published` rides along so the route can tell an answer every reader would
 * get from one only this owner may see, and cache accordingly.
 */
export async function getSpellDetail(
	id: string,
	viewerId: string | null,
	db: Db = getDb()
): Promise<(SpellDetail & { published: boolean }) | null> {
	const row = await db
		.selectFrom('spells')
		.select(['spells.id', 'spells.data', 'spells.preview_ir', 'spells.published_at'])
		.where('id', '=', id)
		.where((eb) =>
			eb.or(
				viewerId
					? [eb('published_at', 'is not', null), eb('user_id', '=', viewerId)]
					: [eb('published_at', 'is not', null)]
			)
		)
		.executeTakeFirst();
	return row
		? {
				id: row.id,
				data: row.data,
				previewIr: row.preview_ir,
				published: row.published_at != null
			}
		: null;
}

/** Deletes a spell if this user owns it. Returns whether a row was removed. */
export async function deleteSpellOwned(
	id: string,
	userId: string,
	db: Db = getDb()
): Promise<boolean> {
	const result = await db
		.deleteFrom('spells')
		.where('id', '=', id)
		.where('user_id', '=', userId)
		.executeTakeFirst();
	return Number(result.numDeletedRows ?? 0) > 0;
}

/** Publishes a spell if this user owns it, or retracts it again. */
export async function setSpellPublished(
	id: string,
	userId: string,
	published: boolean,
	db: Db = getDb()
): Promise<SpellCard | null> {
	const now = new Date().toISOString();
	const row = (await db
		.updateTable('spells')
		.set({ published_at: published ? now : null, updated_at: now })
		.where('id', '=', id)
		.where('user_id', '=', userId)
		.returning([...CARD_COLUMNS, canPreviewColumn.as('can_preview')])
		.executeTakeFirst()) as CardRow | undefined;
	return row ? rowToCard(row) : null;
}

/**
 * One page of the shared library, ranked by upvotes or by publish date.
 *
 * The page is the same for every reader, which is what lets it be cached at the
 * edge. Whose likes are on it is a separate read: {@link listUpvotedSpellIds}.
 */
export async function listPublishedSpells(
	query: LibraryQuery,
	db: Db = getDb()
): Promise<LibraryPage> {
	const limit = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
	const cursor = decodeCursor(query.cursor);

	let builder = db
		.selectFrom('spells')
		.innerJoin('users', 'users.id', 'spells.user_id')
		.select([...CARD_COLUMNS, canPreviewColumn.as('can_preview'), 'users.username as author'])
		.where('spells.published_at', 'is not', null);

	if (query.sort === 'top') {
		builder = builder
			.orderBy('spells.upvote_count', 'desc')
			.orderBy('spells.published_at', 'desc')
			.orderBy('spells.id', 'desc');
		if (cursor && cursor.upvotes !== undefined) {
			builder = builder.where(
				() =>
					sql<SqlBool>`(upvote_count, published_at, spells.id) < (${cursor.upvotes}, ${cursor.publishedAt}::timestamptz, ${cursor.id})`
			);
		}
	} else {
		builder = builder.orderBy('spells.published_at', 'desc').orderBy('spells.id', 'desc');
		if (cursor) {
			builder = builder.where(
				() =>
					sql<SqlBool>`(published_at, spells.id) < (${cursor.publishedAt}::timestamptz, ${cursor.id})`
			);
		}
	}

	const rows = (await builder.limit(limit).execute()) as (CardRow & { author: string })[];
	const spells: LibraryCard[] = rows.map((row) => ({ ...rowToCard(row), author: row.author }));

	const last = spells[spells.length - 1];
	const nextCursor =
		spells.length === limit && last?.publishedAt
			? encodeCursor({
					...(query.sort === 'top' ? { upvotes: last.upvoteCount } : {}),
					publishedAt: last.publishedAt,
					id: last.id
				})
			: null;

	return { spells, nextCursor };
}

/** Every published spell this user has upvoted, to mark their own likes on a shared page. */
export async function listUpvotedSpellIds(userId: string, db: Db = getDb()): Promise<string[]> {
	const rows = await db
		.selectFrom('spell_upvotes')
		.select('spell_id')
		.where('user_id', '=', userId)
		.execute();
	return rows.map((row) => row.spell_id);
}

/**
 * Records this user's upvote on a published spell and bumps the tally, in one
 * transaction. Repeat votes are idempotent. Returns the current count, or null
 * when the spell is missing or not published.
 */
export async function addSpellUpvote(
	spellId: string,
	userId: string,
	db: Db = getDb()
): Promise<number | null> {
	return db.transaction().execute(async (trx) => {
		const spell = await trx
			.selectFrom('spells')
			.select('upvote_count')
			.where('id', '=', spellId)
			.where('published_at', 'is not', null)
			.executeTakeFirst();
		if (!spell) {
			return null;
		}
		const inserted = await trx
			.insertInto('spell_upvotes')
			.values({ spell_id: spellId, user_id: userId })
			.onConflict((oc) => oc.columns(['spell_id', 'user_id']).doNothing())
			.returning('spell_id')
			.executeTakeFirst();
		if (!inserted) {
			return spell.upvote_count;
		}
		const updated = await trx
			.updateTable('spells')
			.set((eb) => ({ upvote_count: eb('upvote_count', '+', 1) }))
			.where('id', '=', spellId)
			.returning('upvote_count')
			.executeTakeFirstOrThrow();
		return updated.upvote_count;
	});
}

/** Removes this user's upvote and lowers the tally. Idempotent like {@link addSpellUpvote}. */
export async function removeSpellUpvote(
	spellId: string,
	userId: string,
	db: Db = getDb()
): Promise<number | null> {
	return db.transaction().execute(async (trx) => {
		const spell = await trx
			.selectFrom('spells')
			.select('upvote_count')
			.where('id', '=', spellId)
			.executeTakeFirst();
		if (!spell) {
			return null;
		}
		const result = await trx
			.deleteFrom('spell_upvotes')
			.where('spell_id', '=', spellId)
			.where('user_id', '=', userId)
			.executeTakeFirst();
		if (Number(result.numDeletedRows ?? 0) === 0) {
			return spell.upvote_count;
		}
		const updated = await trx
			.updateTable('spells')
			.set((eb) => ({ upvote_count: eb('upvote_count', '-', 1) }))
			.where('id', '=', spellId)
			.returning('upvote_count')
			.executeTakeFirstOrThrow();
		return updated.upvote_count;
	});
}
