/** Display label for samples submitted without a Discord handle. */
export const UNKNOWN_CONTRIBUTOR = 'unknown';

/** One leaderboard row, ready to render. */
export type LeaderboardEntry = {
	/** Discord handle, or `'unknown'` for the anonymous bucket (see `anonymous`). */
	username: string;
	/**
	 * True only for the pooled bucket of samples submitted without a handle. A real
	 * contributor whose handle happens to be `'unknown'` is a normal row with this `false`.
	 */
	anonymous: boolean;
	/** Total samples submitted. */
	total: number;
	/** Of those, how many a reviewer has approved. */
	approved: number;
	/** Of those, how many a reviewer has rejected. */
	rejected: number;
};

/** What the `/api/leaderboard` endpoint returns. */
export type LeaderboardResponse = {
	entries: LeaderboardEntry[];
	/** Distinct sign ids present in the dataset, for the sign filter. */
	signIds: string[];
};

/**
 * Honorary titles earned by total drawings submitted, highest threshold first so the
 * first match wins. Below the lowest threshold a contributor has no title.
 */
export const TITLES: { name: string; minDrawings: number }[] = [
	{ name: 'Witch Master', minDrawings: 200 },
	{ name: 'Witch', minDrawings: 100 },
	{ name: 'Witch Apprentice', minDrawings: 30 }
];

/** The title earned for a given total-drawings count, or `null` if none yet. */
export function titleForDrawings(total: number): string | null {
	return TITLES.find((title) => total >= title.minDrawings)?.name ?? null;
}
