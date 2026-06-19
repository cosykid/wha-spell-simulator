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
	/** Total samples submitted (in the current view — per-sign when a sign filter is set). */
	total: number;
	/** Of those, how many a reviewer has approved. */
	approved: number;
	/** Of those, how many a reviewer has rejected. */
	rejected: number;
	/**
	 * The contributor's total across ALL signs, regardless of any sign filter. Titles are
	 * earned by overall output, so the badge stays the same while filtering by sign.
	 */
	overallTotal: number;
};

/** What the `/api/leaderboard` endpoint returns. */
export type LeaderboardResponse = {
	entries: LeaderboardEntry[];
	/** Distinct sign ids present in the dataset, for the sign filter. */
	signIds: string[];
};

/** One row of the Signs leaderboard — how much a single sign has been drawn. */
export type SignEntry = {
	/** Dictionary sign id; the page maps it to a display name. */
	signId: string;
	/** Total samples drawn for this sign (optionally scoped to one contributor). */
	total: number;
	/** Of those, how many a reviewer has approved. */
	approved: number;
	/** Of those, how many a reviewer has rejected. */
	rejected: number;
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

/** Medal emoji for the top three places, empty otherwise. */
export function medal(place: number): string {
	return place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : '';
}

/** CSS class for a title badge (`title title-witch-master`), or empty when untitled. */
export function titleClass(title: string | null): string {
	return title ? `title title-${title.toLowerCase().replace(/\s+/g, '-')}` : '';
}
