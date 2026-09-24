/**
 * @file Cache policy shared by every API route.
 *
 * A reader-specific answer must never be held anywhere but that reader's own
 * browser, so it carries neither `public` nor `s-maxage`. Routes whose answer
 * is the same for everyone pick a shared policy from their own folder.
 */

/** Anything that answers differently per reader, or that only its owner may read. */
export const PRIVATE_NO_STORE = 'private, no-store';

/**
 * Public aggregate data such as leaderboard totals. A minute in the browser
 * absorbs repeat navigation; five minutes at the edge keeps identical group-by
 * queries away from Postgres while new submissions still appear promptly.
 */
export const PUBLIC_AGGREGATE_CACHE =
	'public, max-age=60, s-maxage=300, stale-while-revalidate=1800';
