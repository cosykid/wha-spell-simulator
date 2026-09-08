import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

import { PRIVATE_NO_STORE } from '../cache.js';

export const prerender = false;

/** Reports the session's account so the prerendered client can hydrate auth state. */
export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	setHeaders({ 'cache-control': PRIVATE_NO_STORE });
	return json({ user: locals.user });
};
