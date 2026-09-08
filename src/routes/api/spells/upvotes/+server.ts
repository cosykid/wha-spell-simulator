import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

import { listUpvotedSpellIds } from '$lib/server/storage/spellStore.js';
import { PRIVATE_NO_STORE } from '../../cache.js';

export const prerender = false;

/**
 * The ids this reader has upvoted. Split out of the library feed so the feed
 * itself says nothing about who asked and can be held at the edge. Guests have
 * no likes, and answering them with an empty list rather than a 401 keeps the
 * page from having to know whether anyone is signed in yet.
 */
export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	setHeaders({ 'cache-control': PRIVATE_NO_STORE });
	const ids = locals.user ? await listUpvotedSpellIds(locals.user.id) : [];
	return json({ ids });
};
