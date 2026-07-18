import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

import { listPublishedSpells, listSpellsByOwner } from '$lib/server/storage/spellStore.js';

export const prerender = false;

const MAX_LIMIT = 40;

/**
 * Lists spells. `scope=mine` returns the signed-in user's grimoire, newest change
 * first. `scope=library` (the default) returns published spells for everyone,
 * with `sort=top|new` and keyset `cursor` pagination.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const scope = url.searchParams.get('scope') ?? 'library';

	if (scope === 'mine') {
		if (!locals.user) {
			error(401, 'Sign in to list your spells.');
		}
		const spells = await listSpellsByOwner(locals.user.id);
		return json({ spells });
	}

	const sort = url.searchParams.get('sort') === 'new' ? 'new' : 'top';
	const rawLimit = Number(url.searchParams.get('limit') ?? '20');
	const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, rawLimit), MAX_LIMIT) : 20;
	const page = await listPublishedSpells({
		sort,
		limit,
		cursor: url.searchParams.get('cursor'),
		viewerId: locals.user?.id ?? null
	});
	return json(page);
};
