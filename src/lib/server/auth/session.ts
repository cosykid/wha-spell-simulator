/**
 * @file Session lifecycle: bearer tokens, their cookie, and the composed
 * establish/resolve/destroy operations used by hooks and remote functions.
 *
 * A session is a random 32-byte token handed to the browser in an httpOnly
 * cookie. The database stores only its SHA-256 hash, so a leaked database dump
 * cannot be replayed as cookies. Expiry slides forward when a session passes
 * half of its lifetime.
 */
import { createHash, randomBytes } from 'node:crypto';
import { dev } from '$app/environment';
import type { Cookies } from '@sveltejs/kit';

import { getDb, type Db } from '../storage/db.js';
import {
	deleteExpiredSessions,
	deleteSession,
	findSessionWithUser,
	insertSession,
	touchSession
} from '../storage/sessionStore.js';
import type { UserAccount } from '../storage/userStore.js';

export const SESSION_COOKIE = 'wha_session';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RENEW_BELOW_MS = SESSION_TTL_MS / 2;

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

function setSessionCookie(cookies: Cookies, token: string, expiresAt: Date): void {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		expires: expiresAt
	});
}

/** Logs a user in: stores a fresh session and sets its cookie. */
export async function establishSession(
	user: UserAccount,
	cookies: Cookies,
	db: Db = getDb()
): Promise<void> {
	const token = randomBytes(32).toString('base64url');
	const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
	await deleteExpiredSessions(user.id, db);
	await insertSession(hashToken(token), user.id, expiresAt, db);
	setSessionCookie(cookies, token, expiresAt);
}

/**
 * Resolves the cookie to its user, or null for guests, expired sessions, and
 * unknown tokens. Renews the session cookie past the halfway point.
 */
export async function resolveSession(
	cookies: Cookies,
	db: Db = getDb()
): Promise<UserAccount | null> {
	const token = cookies.get(SESSION_COOKIE);
	if (!token) {
		return null;
	}
	const record = await findSessionWithUser(hashToken(token), db);
	if (!record) {
		cookies.delete(SESSION_COOKIE, { path: '/' });
		return null;
	}
	const remainingMs = new Date(record.expiresAt).getTime() - Date.now();
	if (remainingMs < RENEW_BELOW_MS) {
		const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
		await touchSession(record.tokenHash, expiresAt, db);
		setSessionCookie(cookies, token, expiresAt);
	}
	return record.user;
}

/** Logs the current session out and clears its cookie. */
export async function destroySession(cookies: Cookies, db: Db = getDb()): Promise<void> {
	const token = cookies.get(SESSION_COOKIE);
	if (token) {
		await deleteSession(hashToken(token), db);
	}
	cookies.delete(SESSION_COOKIE, { path: '/' });
}
