/**
 * @file Saved spell rows: each user's presets, the published subset that forms
 * the shared library, and the upvote tallies that rank it. The `upvote_count`
 * column is denormalized and only ever changes in the same transaction as its
 * `spell_upvotes` row, so the two cannot drift.
 */
import { randomUUID } from 'node:crypto';
import { sql, type SqlBool } from 'kysely';

import type { LibraryPage, LibrarySort, SavedSpell } from '$lib/structures/savedSpell.js';
import type { SpellPresetData } from '$lib/structures/spellPreset.js';
import type { SpellIR } from '$lib/types.js';
import { getDb, type Db } from './db.js';

export interface LibraryQuery {
	sort: LibrarySort;
	limit?: number;
	/** Opaque cursor from a previous page's `nextCursor`. */
	cursor?: string | null;
	/** When set, each row reports whether this user has upvoted it. */
	viewerId?: string | null;
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

const SPELL_COLUMNS = [
	'spells.id',
	'spells.name',
	'spells.element',
	'spells.data',
	'spells.preview_ir',
	'spells.published_at',
	'spells.upvote_count',
	'spells.updated_at'
] as const;

interface SpellRow {
	id: string;
	name: string;
	element: string | null;
	data: SpellPresetData;
	preview_ir: SpellIR | null;
	published_at: unknown;
	upvote_count: number;
	updated_at: unknown;
}

function toIso(value: unknown): string {
	return value instanceof Date ? value.toISOString() : value == null ? '' : String(value);
}

function rowToSpell(row: SpellRow): SavedSpell {
	return {
		id: row.id,
		name: row.name,
		element: row.element,
		data: row.data,
		previewIr: row.preview_ir,
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

export async function insertSpell(draft: SpellDraft, db: Db = getDb()): Promise<SavedSpell> {
	const row = (await db
		.insertInto('spells')
		.values({
			id: `spell:${randomUUID()}`,
			user_id: draft.userId,
			name: draft.name,
			data: JSON.stringify(draft.data),
			preview_ir: draft.previewIr ? JSON.stringify(draft.previewIr) : null,
			element: draft.element
		})
		.returning(SPELL_COLUMNS)
		.executeTakeFirstOrThrow()) as SpellRow;
	return rowToSpell(row);
}

/** The owner's spells, newest change first, for the grimoire and drawer list. */
export async function listSpellsByOwner(userId: string, db: Db = getDb()): Promise<SavedSpell[]> {
	const rows = (await db
		.selectFrom('spells')
		.select(SPELL_COLUMNS)
		.where('user_id', '=', userId)
		.orderBy('updated_at', 'desc')
		.orderBy('id', 'desc')
		.execute()) as SpellRow[];
	return rows.map(rowToSpell);
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

/** Publishes or retracts a spell if this user owns it. */
export async function setSpellPublished(
	id: string,
	userId: string,
	published: boolean,
	db: Db = getDb()
): Promise<SavedSpell | null> {
	const now = new Date().toISOString();
	const row = (await db
		.updateTable('spells')
		.set({ published_at: published ? now : null, updated_at: now })
		.where('id', '=', id)
		.where('user_id', '=', userId)
		.returning(SPELL_COLUMNS)
		.executeTakeFirst()) as SpellRow | undefined;
	return row ? rowToSpell(row) : null;
}

/** One page of the shared library, ranked by upvotes or by publish date. */
export async function listPublishedSpells(
	query: LibraryQuery,
	db: Db = getDb()
): Promise<LibraryPage> {
	const limit = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
	const cursor = decodeCursor(query.cursor);
	const viewerId = query.viewerId ?? null;

	let builder = db
		.selectFrom('spells')
		.innerJoin('users', 'users.id', 'spells.user_id')
		.select([...SPELL_COLUMNS, 'users.username as author'])
		.select((eb) => [
			(viewerId
				? eb.exists(
						eb
							.selectFrom('spell_upvotes')
							.select('spell_upvotes.spell_id')
							.whereRef('spell_upvotes.spell_id', '=', 'spells.id')
							.where('spell_upvotes.user_id', '=', viewerId)
					)
				: eb.val(false)
			).as('viewer_upvoted')
		])
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

	const rows = (await builder.limit(limit).execute()) as (SpellRow & {
		author: string;
		viewer_upvoted: boolean;
	})[];

	const spells = rows.map((row) => ({
		...rowToSpell(row),
		author: row.author,
		viewerUpvoted: Boolean(row.viewer_upvoted)
	}));

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
