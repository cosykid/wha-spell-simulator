import { resolve } from '$app/paths';
import { createContext } from 'svelte';
import type { LabelledSample, ReviewStatus, SampleReview } from '$lib/structures/labelledSample.js';
import { SAMPLE_SYMBOLS } from '../sample-maker/symbols.js';
import { sampleStats } from './renderSample.js';
import { setReviewStatus } from './review.remote.js';

/** Rows fetched per page as the reviewer scrolls; the API caps a listing at 200. */
const PAGE_SIZE = 60;

/** Sample tallies per review state, mirrored from the API response. */
type ReviewCounts = Record<'pending' | 'approved' | 'rejected', number>;

export type StatusFilter = ReviewStatus | 'pending' | 'all';

export const STATUS_CHOICES: { value: StatusFilter; label: string }[] = [
	{ value: 'pending', label: 'Pending' },
	{ value: 'approved', label: 'Approved' },
	{ value: 'rejected', label: 'Rejected' },
	{ value: 'all', label: 'All' }
];

// Static id -> display-name lookup, built once from the roster. Module-scoped (not a class
// field) since it never changes and carries no reactive state.
const SIGN_NAME_BY_ID = new Map(SAMPLE_SYMBOLS.map((s) => [s.id, s.displayName]));

function signDisplayName(signId: string): string {
	return SIGN_NAME_BY_ID.get(signId) ?? signId;
}

/** Keyset cursor pointing at the last row already loaded. */
type Cursor = { capturedAt: string; id: string };

type SamplesResponse = {
	count: number | null;
	reviewCounts: ReviewCounts | null;
	samples: LabelledSample[];
};

/**
 * The Sample Reviewer's shared session: owns the filtered, keyset-paginated sample listing,
 * the per-sample verdict flow, and the detail-dialog cursor. The page binds filters and the
 * scroll sentinel to it; the detail dialog reads `detail`/`detailStats` and drives navigation
 * through `step`. DOM-bound effects (the IntersectionObserver, the dialog's `showModal`) stay
 * in the components — everything else lives here.
 */
export class ReviewerSession {
	displayName = signDisplayName;

	// Sign ids offered by the filter: the Sample Maker's roster plus anything seen in stored
	// samples (older submissions carry signs the maker no longer offers).
	knownSignIds = $state<string[]>(SAMPLE_SYMBOLS.map((s) => s.id));
	signOptions = $derived(
		[...this.knownSignIds].sort((a, b) => this.displayName(a).localeCompare(this.displayName(b)))
	);

	// Filters. Status defaults to 'pending' so the page opens on the unreviewed queue.
	signFilter = $state<string>('all');
	statusFilter = $state<StatusFilter>('pending');
	showOverlay = $state(true);

	// Username search. `usernameQuery` tracks the input; `appliedUsername` is the debounced
	// value that actually drives the fetch, so typing doesn't hammer the API.
	usernameQuery = $state('');
	appliedUsername = $state('');
	#usernameTimer: ReturnType<typeof setTimeout> | undefined;
	onUsernameInput = (): void => {
		clearTimeout(this.#usernameTimer);
		this.#usernameTimer = setTimeout(() => (this.appliedUsername = this.usernameQuery.trim()), 300);
	};

	// Query state. `loading` covers the first page; `loadingMore` covers appended pages.
	samples = $state<LabelledSample[]>([]);
	reviewCounts = $state<ReviewCounts | null>(null);
	loading = $state(true);
	loadingMore = $state(false);
	hasMore = $state(false);
	error = $state<string | null>(null);
	loadMoreError = $state<string | null>(null);
	#requestSeq = 0;
	// Count of dots shown after "Loading more"; cycles 0 → 3 while more pages remain.
	loadingDots = $state(0);

	// Verdict state: ids with an in-flight save, plus the latest failure (if any).
	savingIds = $state<string[]>([]);
	actionError = $state<string | null>(null);

	// Detail dialog cursor.
	detailIndex = $state<number | null>(null);
	copied = $state<'id' | 'json' | null>(null);
	detail = $derived(this.detailIndex === null ? null : (this.samples[this.detailIndex] ?? null));
	detailStats = $derived(this.detail ? sampleStats(this.detail) : null);
	detailBusy = $derived(this.detail !== null && this.savingIds.includes(this.detail.id));

	/** Fetches one page of samples for the current filters; throws on a bad response. */
	async #fetchSamples(
		signId: string,
		status: StatusFilter,
		username: string,
		cursor: Cursor | null
	): Promise<SamplesResponse> {
		const sign = signId === 'all' ? '' : `&signId=${encodeURIComponent(signId)}`;
		const review = status === 'all' ? '' : `&reviewStatus=${status}`;
		const user = username ? `&username=${encodeURIComponent(username)}` : '';
		const seek = cursor
			? `&cursorCapturedAt=${encodeURIComponent(cursor.capturedAt)}&cursorId=${encodeURIComponent(cursor.id)}`
			: '';
		const response = await fetch(
			`${resolve('/api/samples')}?limit=${PAGE_SIZE}${sign}${review}${user}${seek}`
		);
		const body = (await response.json()) as
			| ({ ok: true } & SamplesResponse)
			| { ok: false; error?: string };
		if (!response.ok || !body.ok) {
			throw new Error(
				(!body.ok && body.error) || `The samples endpoint replied ${response.status}.`
			);
		}
		return body;
	}

	/** Note any sign ids the filter doesn't yet offer (older submissions carry them). */
	#registerSignIds(list: LabelledSample[]): void {
		for (const { label } of list) {
			if (!this.knownSignIds.includes(label.signId)) {
				this.knownSignIds = [...this.knownSignIds, label.signId];
			}
		}
	}

	/** Loads the first page for a filter set, replacing whatever is on screen. */
	async loadFirstPage(signId: string, status: StatusFilter, username: string): Promise<void> {
		const seq = ++this.#requestSeq;
		this.loading = true;
		this.error = null;
		this.loadMoreError = null;
		try {
			const body = await this.#fetchSamples(signId, status, username, null);
			if (seq !== this.#requestSeq) return; // superseded by a newer request
			this.samples = body.samples;
			this.reviewCounts = body.reviewCounts;
			this.hasMore = body.samples.length === PAGE_SIZE;
			this.#registerSignIds(body.samples);
		} catch (caught) {
			if (seq !== this.#requestSeq) return;
			this.error = caught instanceof Error ? caught.message : 'Failed to load samples.';
			this.samples = [];
			this.reviewCounts = null;
			this.hasMore = false;
		} finally {
			if (seq === this.#requestSeq) this.loading = false;
		}
	}

	/** Appends the next page; fired by the scroll sentinel or the retry button. */
	loadMore = async (): Promise<void> => {
		if (this.loading || this.loadingMore || !this.hasMore) return;
		const last = this.samples[this.samples.length - 1];
		if (!last) return;
		const seq = this.#requestSeq; // tie to the current filter set, don't supersede it
		this.loadingMore = true;
		this.loadMoreError = null;
		try {
			const cursor: Cursor = { capturedAt: last.meta.capturedAt, id: last.id };
			const body = await this.#fetchSamples(
				this.signFilter,
				this.statusFilter,
				this.appliedUsername,
				cursor
			);
			if (seq !== this.#requestSeq) return; // filters changed mid-flight; drop this page
			this.samples = [...this.samples, ...body.samples];
			this.hasMore = body.samples.length === PAGE_SIZE;
			this.#registerSignIds(body.samples);
		} catch (caught) {
			if (seq !== this.#requestSeq) return;
			this.loadMoreError =
				caught instanceof Error ? caught.message : 'Failed to load more samples.';
		} finally {
			this.loadingMore = false;
		}
	};

	refresh = (): void =>
		void this.loadFirstPage(this.signFilter, this.statusFilter, this.appliedUsername);

	/**
	 * Saves a verdict (or clears it with `null`) and patches the local list in place.
	 * Verdict-ed cards stay visible until the next refetch so a misclick is undoable.
	 */
	async applyVerdict(sample: LabelledSample, status: ReviewStatus | null): Promise<void> {
		if (this.savingIds.includes(sample.id)) return;
		this.savingIds = [...this.savingIds, sample.id];
		this.actionError = null;
		try {
			const result = await setReviewStatus({ id: sample.id, status });
			if (!result.ok) {
				this.actionError =
					result.reason === 'not-found'
						? 'That sample no longer exists in the database.'
						: 'Saving the verdict failed — try again.';
				return;
			}
			this.#patchSample(sample.id, result.review);
		} catch {
			this.actionError = 'Saving the verdict failed — try again.';
		} finally {
			this.savingIds = this.savingIds.filter((id) => id !== sample.id);
		}
	}

	/** Applies a saved verdict to the local list and the per-status tallies. */
	#patchSample(id: string, review: SampleReview | null): void {
		const previous = this.samples.find((s) => s.id === id);
		if (!previous) return;
		const from = previous.review?.status ?? 'pending';
		const to = review?.status ?? 'pending';
		if (this.reviewCounts && from !== to) {
			this.reviewCounts[from] -= 1;
			this.reviewCounts[to] += 1;
		}
		this.samples = this.samples.map((s) => (s.id === id ? { ...s, review } : s));
	}

	/** Records a verdict from the dialog, then advances to keep the review flowing. */
	async verdictFromDialog(status: ReviewStatus): Promise<void> {
		const current = this.detail;
		if (!current) return;
		await this.applyVerdict(current, status);
		if (!this.actionError && this.samples.length > 1) this.step(1);
	}

	openDetail(index: number): void {
		this.detailIndex = index;
		this.copied = null;
	}

	/** Step through samples inside the dialog, wrapping at both ends. */
	step(delta: number): void {
		if (this.detailIndex === null || this.samples.length === 0) return;
		this.detailIndex = (this.detailIndex + delta + this.samples.length) % this.samples.length;
		this.copied = null;
	}

	onWindowKeydown = (event: KeyboardEvent): void => {
		if (this.detailIndex === null) return;
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		switch (event.key) {
			case 'ArrowRight':
				event.preventDefault();
				this.step(1);
				break;
			case 'ArrowLeft':
				event.preventDefault();
				this.step(-1);
				break;
			case 'a':
			case 'A':
				void this.verdictFromDialog('approved');
				break;
			case 'r':
			case 'R':
				void this.verdictFromDialog('rejected');
				break;
			case 'u':
			case 'U':
				if (this.detail?.review) void this.applyVerdict(this.detail, null);
				break;
		}
	};

	/** Copy the sample's id (for DB lookups) or full JSON (feeds `npm run sample:svg`). */
	async copy(kind: 'id' | 'json'): Promise<void> {
		const current = this.detail;
		if (!current) return;
		await navigator.clipboard.writeText(
			kind === 'id' ? current.id : JSON.stringify(current, null, '\t')
		);
		this.copied = kind;
	}
}

export const [getReviewerSession, setReviewerSession] = createContext<ReviewerSession>();
