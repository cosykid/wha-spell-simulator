import { tallySigns, type SignTallyQuery } from '$lib/server/storage/labelledSampleStore.js';

import { json } from '@sveltejs/kit';
import type { SignEntry } from '../../../tools/leaderboard/leaderboard.js';

export const prerender = false;

/**
 * Per-sign drawing tallies for the Signs leaderboard — how much each sign has been
 * drawn. Optional `?username=` scopes the counts to one contributor (their personal
 * per-sign breakdown) instead of everyone. Ranked by total, most-drawn first.
 */
export async function GET({ url }) {
	try {
		const query: SignTallyQuery = {};
		const username = url.searchParams.get('username')?.trim();
		if (username) {
			query.discordUsername = username;
		}

		const tallies = await tallySigns(query);
		const signs: SignEntry[] = tallies
			.map((tally) => ({
				signId: tally.signId,
				total: tally.total,
				approved: tally.approved,
				rejected: tally.rejected
			}))
			.sort((a, b) => b.total - a.total || b.approved - a.approved);

		return json({ ok: true, signs });
	} catch (error) {
		return json(
			{
				ok: false,
				error: error instanceof Error ? error.message : 'Failed to build sign tallies.'
			},
			{ status: 500 }
		);
	}
}
