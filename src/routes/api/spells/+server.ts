import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

import { listPublishedSpells, listSpellsByOwner } from '$lib/server/storage/spellStore.js';
import { PRIVATE_NO_STORE } from '../cache.js';
import { LIBRARY_FEED_CACHE } from './cache.js';

export const prerender = false;

const MAX_LIMIT = 40;

/**
 * Lists spell cards. `scope=mine` returns the signed-in user's grimoire, newest
 * change first. `scope=library` (the default) returns published spells for
 * everyone, with `sort=top|new` and keyset `cursor` pagination.
 *
 * Neither scope carries the drawing behind a card. `GET /api/spells/[id]`
 * fetches that for the one spell a reader opens.
 */
export const GET: RequestHandler = async ({ locals, url, setHeaders }) => {
	const scope = url.searchParams.get('scope') ?? 'library';

	if (scope === 'mine') {
		if (!locals.user) {
			error(401, 'Sign in to list your spells.');
		}
		setHeaders({ 'cache-control': PRIVATE_NO_STORE });
		const spells = await listSpellsByOwner(locals.user.id);
		return json({ spells });
	}

	const sort = url.searchParams.get('sort') === 'new' ? 'new' : 'top';
	const rawLimit = Number(url.searchParams.get('limit') ?? '20');
	const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, rawLimit), MAX_LIMIT) : 20;
	// The same page for every reader, signed in or not, which is what lets the
	// edge hold it. A reader's own likes arrive from `/api/spells/upvotes`.
	setHeaders({ 'cache-control': LIBRARY_FEED_CACHE });
	const page = await listPublishedSpells({ sort, limit, cursor: url.searchParams.get('cursor') });
	return json(page);
};
