/**
 * @file Account remote functions: register, login, logout. These are commands
 * rather than forms because they are only ever called from the auth dialog,
 * which is client-rendered by definition.
 */
import { command, getRequestEvent } from '$app/server';
import { z } from 'zod';

import { fallbackPasswordHash, hashPassword, verifyPassword } from '$lib/server/auth/password.js';
import { destroySession, establishSession } from '$lib/server/auth/session.js';
import {
	DuplicateUsernameError,
	findUserByUsername,
	insertUser
} from '$lib/server/storage/userStore.js';

/** Shared by register and login so the dialog can handle both uniformly. */
export type AuthResult =
	| { ok: true; user: { id: string; username: string } }
	| { ok: false; reason: 'username-taken' | 'invalid-credentials' | 'server-error' };

const CredentialsSchema = z.object({
	username: z
		.string()
		.regex(/^[A-Za-z0-9_-]{3,24}$/, 'username must be 3-24 letters, digits, - or _'),
	password: z.string().min(8).max(128)
});

export const register = command(
	CredentialsSchema,
	async ({ username, password }): Promise<AuthResult> => {
		const { cookies } = getRequestEvent();
		try {
			const user = await insertUser(username, await hashPassword(password));
			await establishSession(user, cookies);
			return { ok: true, user };
		} catch (error) {
			if (error instanceof DuplicateUsernameError) {
				return { ok: false, reason: 'username-taken' };
			}
			console.error('Failed to register account:', error);
			return { ok: false, reason: 'server-error' };
		}
	}
);

export const login = command(
	CredentialsSchema,
	async ({ username, password }): Promise<AuthResult> => {
		const { cookies } = getRequestEvent();
		try {
			const user = await findUserByUsername(username);
			// Verify against a dummy hash for unknown names so timing stays uniform.
			const stored = user?.passwordHash ?? (await fallbackPasswordHash());
			const matches = await verifyPassword(password, stored);
			if (!user || !matches) {
				return { ok: false, reason: 'invalid-credentials' };
			}
			await establishSession({ id: user.id, username: user.username }, cookies);
			return { ok: true, user: { id: user.id, username: user.username } };
		} catch (error) {
			console.error('Failed to log in:', error);
			return { ok: false, reason: 'server-error' };
		}
	}
);

export const logout = command(async (): Promise<{ ok: boolean }> => {
	const { cookies } = getRequestEvent();
	try {
		await destroySession(cookies);
		return { ok: true };
	} catch (error) {
		console.error('Failed to log out:', error);
		return { ok: false };
	}
});
