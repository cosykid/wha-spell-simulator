import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

export const prerender = false;

/** Reports the session's account so the prerendered client can hydrate auth state. */
export const GET: RequestHandler = async ({ locals }) => {
	return json({ user: locals.user });
};
