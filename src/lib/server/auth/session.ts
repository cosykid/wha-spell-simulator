/**
 * @file Session lifecycle: bearer tokens, their cookie, and the composed
 * establish/resolve/destroy operations used by hooks and remote functions.
 *
 * A session is a random 32-byte token handed to the browser in an httpOnly
 * cookie. The database stores only its SHA-256 hash, so a leaked database dump
 * cannot be replayed as cookies. Expiry slides forward when a session passes
 * half of its lifetime.
 *
 * A readable marker cookie rides alongside it. See sessionMarker.ts for why,
 * and treat the pair as one thing: it is written and cleared here and nowhere
 * else.
 */
import { createHash, randomBytes } from 'node:crypto';
import { dev } from '$app/environment';
import type { Cookies } from '@sveltejs/kit';

import { SESSION_MARKER_COOKIE } from '$lib/auth/sessionMarker.js';
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

/** Shared by both cookies, so neither can outlive or outrange the other. */
const COOKIE_SCOPE = {
	path: '/',
	sameSite: 'lax',
	secure: !dev
} as const;

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/**
 * Hands the browser the token and the marker that admits to it. Never write one
 * without the other: the client reads the marker's absence as "guest", so a
 * token with no marker would leave a signed-in reader looking signed out.
 */
function writeSessionCookies(cookies: Cookies, token: string, expiresAt: Date): void {
	cookies.set(SESSION_COOKIE, token, { ...COOKIE_SCOPE, httpOnly: true, expires: expiresAt });
	cookies.set(SESSION_MARKER_COOKIE, '1', {
		...COOKIE_SCOPE,
		httpOnly: false,
		expires: expiresAt
	});
}

/** Takes both back, wherever a session ends. */
function clearSessionCookies(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, { path: '/' });
	cookies.delete(SESSION_MARKER_COOKIE, { path: '/' });
}

/** Logs a user in: stores a fresh session and sets its cookies. */
export async function establishSession(
	user: UserAccount,
	cookies: Cookies,
	db: Db = getDb()
): Promise<void> {
	const token = randomBytes(32).toString('base64url');
	const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
	await deleteExpiredSessions(user.id, db);
	await insertSession(hashToken(token), user.id, expiresAt, db);
	writeSessionCookies(cookies, token, expiresAt);
}

/**
 * Resolves the cookie to its user, or null for guests, expired sessions, and
 * unknown tokens. Renews the session cookies past the halfway point.
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
		// Also how a marker that outlived its session is swept up: the round trip
		// it cost is the one that clears it.
		clearSessionCookies(cookies);
		return null;
	}
	const remainingMs = new Date(record.expiresAt).getTime() - Date.now();
	if (remainingMs < RENEW_BELOW_MS) {
		const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
		await touchSession(record.tokenHash, expiresAt, db);
		writeSessionCookies(cookies, token, expiresAt);
	}
	return record.user;
}

/** Logs the current session out and clears its cookies. */
export async function destroySession(cookies: Cookies, db: Db = getDb()): Promise<void> {
	const token = cookies.get(SESSION_COOKIE);
	if (token) {
		await deleteSession(hashToken(token), db);
	}
	clearSessionCookies(cookies);
}
