import {
	listSampleSignIds,
	tallyContributors,
	type ContributorTally,
	type ContributorTallyQuery
} from '$lib/server/storage/labelledSampleStore.js';

import { json } from '@sveltejs/kit';
import { UNKNOWN_CONTRIBUTOR, type LeaderboardEntry } from '../../tools/leaderboard/leaderboard.js';

export const prerender = false;

/**
 * Merge key for a contributor. Discord handles are case-insensitive, so merge by
 * lowercase; handle-less samples pool under a dedicated key (the empty string — never a
 * trimmed handle) so a contributor whose handle is literally 'unknown' stays distinct.
 */
function contributorKey(handle: string | undefined): string {
	return handle ? handle.toLowerCase() : '';
}

/** Folds the per-username DB groups into one entry per contributor (case-insensitive). */
function mergeTallies(tallies: ContributorTally[]): Map<string, LeaderboardEntry> {
	const merged = new Map<string, LeaderboardEntry>();
	// Per handle, the sample count of the casing currently shown — so when casings merge
	// we keep the most-used one and the label stays stable across requests (the DB GROUP
	// BY order is not).
	const topCasingCount = new Map<string, number>();
	for (const tally of tallies) {
		const handle = tally.discordUsername?.trim();
		const key = contributorKey(handle);
		const existing = merged.get(key);
		if (existing) {
			existing.total += tally.total;
			existing.approved += tally.approved;
			existing.rejected += tally.rejected;
			if (handle && tally.total > (topCasingCount.get(key) ?? 0)) {
				existing.username = handle;
				topCasingCount.set(key, tally.total);
			}
			continue;
		}
		merged.set(key, {
			username: handle || UNKNOWN_CONTRIBUTOR,
			anonymous: !handle,
			total: tally.total,
			approved: tally.approved,
			rejected: tally.rejected,
			overallTotal: tally.total
		});
		topCasingCount.set(key, tally.total);
	}
	return merged;
}

/**
 * Per-contributor drawing tallies for the Leaderboard tool. Handle-less submissions
 * collapse into a single `'unknown'` row. Entries come back ranked by total
 * submissions, most first; the page re-ranks client-side for the approved view.
 *
 * Optional `?signId=` restricts the tally to one sign (a per-sign ranking). The
 * `signIds` list (all signs present, regardless of the filter) backs the sign picker.
 * `overallTotal` is always the contributor's all-signs total so titles (earned by
 * overall output) don't change when filtering by sign.
 */
export async function GET({ url }) {
	try {
		const query: ContributorTallyQuery = {};
		const signId = url.searchParams.get('signId');
		if (signId) {
			query.signId = signId;
		}

		const [tallies, signIds] = await Promise.all([tallyContributors(query), listSampleSignIds()]);
		const merged = mergeTallies(tallies);

		// Titles are earned by overall output, so when a sign filter narrows the counts we
		// still need each contributor's all-signs total. Without a filter the view total IS
		// the overall total, so skip the extra query.
		if (signId) {
			const overall = mergeTallies(await tallyContributors());
			for (const [key, entry] of merged) {
				entry.overallTotal = overall.get(key)?.total ?? entry.total;
			}
		}

		const entries = [...merged.values()].sort(
			(a, b) => b.total - a.total || b.approved - a.approved
		);

		return json({ ok: true, entries, signIds });
	} catch (error) {
		return json(
			{ ok: false, error: error instanceof Error ? error.message : 'Failed to build leaderboard.' },
			{ status: 500 }
		);
	}
}
