/**
 * @file Account rows for spell saving. Usernames are unique case-insensitively
 * (enforced by the `users_username_lower_key` index) but stored with the casing
 * the user typed.
 */
import { randomUUID } from 'node:crypto';
import { getDb, type Db } from './db.js';

/** Thrown when registering a username that is already taken (case-insensitive). */
export class DuplicateUsernameError extends Error {
	constructor(message = 'That witch name is already taken.') {
		super(message);
		this.name = 'DuplicateUsernameError';
	}
}

/** The public identity attached to sessions and spells. */
export interface UserAccount {
	id: string;
	username: string;
}

/** Account row including the stored password hash, for login verification only. */
export interface UserCredentials extends UserAccount {
	passwordHash: string;
}

/** True for a Postgres unique-constraint violation surfaced by node-postgres. */
function isUniqueViolation(error: unknown): boolean {
	return (
		typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
	);
}

/**
 * Creates an account with an already-hashed password.
 *
 * @throws {DuplicateUsernameError} when the username is taken, case-insensitively.
 */
export async function insertUser(
	username: string,
	passwordHash: string,
	db: Db = getDb()
): Promise<UserAccount> {
	const id = `user:${randomUUID()}`;
	try {
		const row = await db
			.insertInto('users')
			.values({ id, username, password_hash: passwordHash })
			.returning(['id', 'username'])
			.executeTakeFirstOrThrow();
		return row;
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw new DuplicateUsernameError();
		}
		throw error;
	}
}

/** Looks up an account by username, case-insensitively. */
export async function findUserByUsername(
	username: string,
	db: Db = getDb()
): Promise<UserCredentials | null> {
	const row = await db
		.selectFrom('users')
		.select(['id', 'username', 'password_hash'])
		.where(({ eb, fn, val }) => eb(fn('lower', ['username']), '=', fn('lower', [val(username)])))
		.executeTakeFirst();
	return row ? { id: row.id, username: row.username, passwordHash: row.password_hash } : null;
}
