import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

import { getSpellDetail } from '$lib/server/storage/spellStore.js';
import { PRIVATE_NO_STORE, SPELL_DETAIL_CACHE } from '../cache.js';

export const prerender = false;

/**
 * The drawing behind one card, fetched when a reader opens or previews a spell.
 * Published spells are readable by anyone; a private one only by its owner.
 */
export const GET: RequestHandler = async ({ locals, params, setHeaders }) => {
	const detail = await getSpellDetail(params.id, locals.user?.id ?? null);
	if (!detail) {
		// A private spell and a missing one answer the same, so the library
		// cannot be used to learn that an unpublished spell exists.
		error(404, 'No such spell.');
	}
	const { published, ...spell } = detail;
	setHeaders({ 'cache-control': published ? SPELL_DETAIL_CACHE : PRIVATE_NO_STORE });
	return json({ spell });
};
