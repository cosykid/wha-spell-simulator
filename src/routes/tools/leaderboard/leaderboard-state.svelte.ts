import { resolve } from '$app/paths';
import { createContext } from 'svelte';
import { SAMPLE_SYMBOLS } from '../sample-maker/symbols.js';
import { titleForDrawings, type LeaderboardEntry, type SignEntry } from './leaderboard.js';

/** The two leaderboards the page switches between. */
export type View = 'contributors' | 'signs';

/** Which tally drives a board's ranking. */
export type RankBy = 'total' | 'approved';

export const RANK_CHOICES: { value: RankBy; label: string }[] = [
	{ value: 'total', label: 'Total drawings' },
	{ value: 'approved', label: 'Approved drawings' }
];

// Static id -> display-name lookup, built once from the roster. Module-scoped (not a class
// field) since it never changes and carries no reactive state.
const SIGN_NAME_BY_ID = new Map(SAMPLE_SYMBOLS.map((s) => [s.id, s.displayName]));

function signDisplayName(signId: string): string {
	return SIGN_NAME_BY_ID.get(signId) ?? signId;
}

/** A row after ranking, ready for {@link BoardTable}. */
export interface BoardRow {
	key: string;
	rank: number;
	name: string;
	/** Italicize + mute the name (the anonymous bucket). */
	muted?: boolean;
	/** Earned title badge, or `null`/`undefined` when the board has no title column. */
	title?: string | null;
	approved: number;
	rejected: number;
	total: number;
}

/**
 * The Leaderboard page's shared session: owns both boards' fetch state, filters, and the
 * derived rankings, so the page shell and its board components stay declarative. The two
 * boards run independently (each fetches only while its tab is active) but share the
 * sign-name lookup and the active {@link View}.
 */
export class LeaderboardSession {
	view = $state<View>('contributors');

	displayName = signDisplayName;

	// --- Contributors board ------------------------------------------------------------
	rankBy = $state<RankBy>('total');

	// Sign ids offered by the filter: the Sample Maker roster plus anything else seen in
	// stored samples (older submissions may carry retired signs).
	knownSignIds = $state<string[]>(SAMPLE_SYMBOLS.map((s) => s.id));
	signOptions = $derived(
		[...this.knownSignIds].sort((a, b) => this.displayName(a).localeCompare(this.displayName(b)))
	);

	// `signFilter` re-fetches the DB; `rankBy` and `usernameQuery` are applied client-side.
	signFilter = $state<string>('all');
	usernameQuery = $state('');

	entries = $state<LeaderboardEntry[]>([]);
	loading = $state(true);
	error = $state<string | null>(null);
	#requestSeq = 0;

	async loadContributors(sign: string): Promise<void> {
		const seq = ++this.#requestSeq;
		this.loading = true;
		this.error = null;
		try {
			const signParam = sign === 'all' ? '' : `?signId=${encodeURIComponent(sign)}`;
			const response = await fetch(`${resolve('/api/leaderboard')}${signParam}`);
			const body = (await response.json()) as
				| { ok: true; entries: LeaderboardEntry[]; signIds: string[] }
				| { ok: false; error?: string };
			if (seq !== this.#requestSeq) return; // superseded by a newer request
			if (!response.ok || !body.ok) {
				throw new Error(
					(!body.ok && body.error) || `The leaderboard endpoint replied ${response.status}.`
				);
			}
			this.entries = body.entries;
			// Union in any unseen sign ids with a single reassignment (order is irrelevant —
			// `signOptions` sorts by display name).
			const newSignIds = body.signIds.filter((id) => !this.knownSignIds.includes(id));
			if (newSignIds.length > 0) this.knownSignIds = [...this.knownSignIds, ...newSignIds];
		} catch (caught) {
			if (seq !== this.#requestSeq) return;
			this.error = caught instanceof Error ? caught.message : 'Failed to load the leaderboard.';
			this.entries = [];
		} finally {
			if (seq === this.#requestSeq) this.loading = false;
		}
	}

	refreshContributors = (): void => void this.loadContributors(this.signFilter);

	/** Full board, ranked by the active metric with each row's standing fixed. */
	#ranked = $derived.by(() => {
		const by = this.rankBy;
		const other: RankBy = by === 'total' ? 'approved' : 'total';
		return [...this.entries]
			.sort((a, b) => b[by] - a[by] || b[other] - a[other] || a.username.localeCompare(b.username))
			.map((entry, index) => ({ ...entry, rank: index + 1 }));
	});

	// Username search filters the rows shown but keeps each contributor's true standing, so you
	// can look someone up and still see where they place overall.
	#visible = $derived.by(() => {
		const q = this.usernameQuery.trim().toLowerCase();
		return q ? this.#ranked.filter((row) => row.username.toLowerCase().includes(q)) : this.#ranked;
	});

	/** Visible contributor count (after the username search). */
	visibleCount = $derived(this.#visible.length);

	/** Contributor rows mapped into the shape {@link BoardTable} renders. */
	contributorRows = $derived.by((): BoardRow[] =>
		this.#visible.map((row) => ({
			key: `${row.anonymous}:${row.username.toLowerCase()}`,
			rank: row.rank,
			name: row.username,
			muted: row.anonymous,
			title: titleForDrawings(row.overallTotal),
			approved: row.approved,
			rejected: row.rejected,
			total: row.total
		}))
	);

	// Aggregate counts over the rows currently shown, so they track both the sign filter
	// (re-fetched) and the username search (client-side).
	shownDrawings = $derived(this.#visible.reduce((sum, e) => sum + e.total, 0));
	shownApproved = $derived(this.#visible.reduce((sum, e) => sum + e.approved, 0));
	shownRejected = $derived(this.#visible.reduce((sum, e) => sum + e.rejected, 0));

	// --- Signs board -------------------------------------------------------------------
	signRankBy = $state<RankBy>('total');

	// Optional contributor scope. `signUser` tracks the input; `signAppliedUser` is the
	// debounced value that drives the fetch (the count is computed server-side per user).
	signUser = $state('');
	signAppliedUser = $state('');
	#signUserTimer: ReturnType<typeof setTimeout> | undefined;
	onSignUserInput = (): void => {
		clearTimeout(this.#signUserTimer);
		this.#signUserTimer = setTimeout(() => (this.signAppliedUser = this.signUser.trim()), 300);
	};

	signs = $state<SignEntry[]>([]);
	signLoading = $state(true);
	signError = $state<string | null>(null);
	#signSeq = 0;

	async loadSigns(username: string): Promise<void> {
		const seq = ++this.#signSeq;
		this.signLoading = true;
		this.signError = null;
		try {
			const userParam = username ? `?username=${encodeURIComponent(username)}` : '';
			const response = await fetch(`${resolve('/api/leaderboard/signs')}${userParam}`);
			const body = (await response.json()) as
				| { ok: true; signs: SignEntry[] }
				| { ok: false; error?: string };
			if (seq !== this.#signSeq) return; // superseded by a newer request
			if (!response.ok || !body.ok) {
				throw new Error(
					(!body.ok && body.error) || `The signs endpoint replied ${response.status}.`
				);
			}
			this.signs = body.signs;
		} catch (caught) {
			if (seq !== this.#signSeq) return;
			this.signError =
				caught instanceof Error ? caught.message : 'Failed to load the sign tallies.';
			this.signs = [];
		} finally {
			if (seq === this.#signSeq) this.signLoading = false;
		}
	}

	refreshSigns = (): void => void this.loadSigns(this.signAppliedUser);

	/** Signs ranked by the active metric, mapped into {@link BoardTable} rows. */
	signRows = $derived.by((): BoardRow[] => {
		const by = this.signRankBy;
		const other: RankBy = by === 'total' ? 'approved' : 'total';
		return [...this.signs]
			.sort(
				(a, b) =>
					b[by] - a[by] ||
					b[other] - a[other] ||
					this.displayName(a.signId).localeCompare(this.displayName(b.signId))
			)
			.map((sign, index) => ({
				key: sign.signId,
				rank: index + 1,
				name: this.displayName(sign.signId),
				approved: sign.approved,
				rejected: sign.rejected,
				total: sign.total
			}));
	});

	signsDrawings = $derived(this.signs.reduce((sum, s) => sum + s.total, 0));
	signsApproved = $derived(this.signs.reduce((sum, s) => sum + s.approved, 0));
	signsRejected = $derived(this.signs.reduce((sum, s) => sum + s.rejected, 0));
}

export const [getLeaderboardSession, setLeaderboardSession] = createContext<LeaderboardSession>();
