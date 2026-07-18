/**
 * @file Session rows backing login cookies. Serverless instances share nothing in
 * memory, so every session lives in Postgres, keyed by the SHA-256 hash of the
 * bearer token. The raw token never touches the database.
 */
import { getDb, type Db } from './db.js';
import type { UserAccount } from './userStore.js';

export interface SessionRecord {
	tokenHash: string;
	expiresAt: string;
	user: UserAccount;
}

export async function insertSession(
	tokenHash: string,
	userId: string,
	expiresAt: Date,
	db: Db = getDb()
): Promise<void> {
	await db
		.insertInto('sessions')
		.values({ token_hash: tokenHash, user_id: userId, expires_at: expiresAt.toISOString() })
		.execute();
}

interface SessionRow {
	token_hash: string;
	expires_at: unknown;
	id: string;
	username: string;
}

function toIso(value: unknown): string {
	return value instanceof Date ? value.toISOString() : value == null ? '' : String(value);
}

/** Finds an unexpired session and its owner. Expired rows are treated as absent. */
export async function findSessionWithUser(
	tokenHash: string,
	db: Db = getDb()
): Promise<SessionRecord | null> {
	const row = (await db
		.selectFrom('sessions')
		.innerJoin('users', 'users.id', 'sessions.user_id')
		.select(['sessions.token_hash', 'sessions.expires_at', 'users.id', 'users.username'])
		.where('sessions.token_hash', '=', tokenHash)
		.where('sessions.expires_at', '>', new Date().toISOString())
		.executeTakeFirst()) as SessionRow | undefined;
	if (!row) {
		return null;
	}
	return {
		tokenHash: row.token_hash,
		expiresAt: toIso(row.expires_at),
		user: { id: row.id, username: row.username }
	};
}

/** Pushes a session's expiry out, for sliding renewal on active use. */
export async function touchSession(
	tokenHash: string,
	expiresAt: Date,
	db: Db = getDb()
): Promise<void> {
	await db
		.updateTable('sessions')
		.set({ expires_at: expiresAt.toISOString() })
		.where('token_hash', '=', tokenHash)
		.execute();
}

export async function deleteSession(tokenHash: string, db: Db = getDb()): Promise<void> {
	await db.deleteFrom('sessions').where('token_hash', '=', tokenHash).execute();
}

/** Drops this user's expired sessions, called opportunistically on login. */
export async function deleteExpiredSessions(userId: string, db: Db = getDb()): Promise<void> {
	await db
		.deleteFrom('sessions')
		.where('user_id', '=', userId)
		.where('expires_at', '<=', new Date().toISOString())
		.execute();
}
