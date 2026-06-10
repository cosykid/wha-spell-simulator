import {
	countLabelledSamples,
	countSamplesByReviewStatus,
	listLabelledSamples,
	type LabelledSampleQuery
} from '$lib/server/storage/labelledSampleStore.js';

import { json } from '@sveltejs/kit';

export const prerender = false;

function serverError(error: unknown, fallback: string): Response {
	return json(
		{ ok: false, error: error instanceof Error ? error.message : fallback },
		{ status: 500 }
	);
}

// Submissions go through the `submitSample` remote form in
// `src/routes/tools/sample-maker/samples.remote.ts`.

/**
 * Lists stored samples (optionally `?signId=`, `?reviewStatus=pending|approved|rejected`,
 * `?username=`, `?limit=`, and a `?cursorCapturedAt=&cursorId=` keyset cursor) for
 * verifying uploads and backing the Sample Reviewer.
 */
export async function GET({ url }) {
	try {
		const query: LabelledSampleQuery = {};
		const signId = url.searchParams.get('signId');
		if (signId) {
			query.signId = signId;
		}
		const reviewStatus = url.searchParams.get('reviewStatus');
		if (reviewStatus === 'pending' || reviewStatus === 'approved' || reviewStatus === 'rejected') {
			query.reviewStatus = reviewStatus;
		}
		const username = url.searchParams.get('username')?.trim();
		if (username) {
			query.discordUsername = username;
		}
		const limit = Number(url.searchParams.get('limit'));
		if (Number.isFinite(limit) && limit > 0) {
			query.limit = limit;
		}
		const cursorCapturedAt = url.searchParams.get('cursorCapturedAt');
		const cursorId = url.searchParams.get('cursorId');
		if (cursorCapturedAt && cursorId) {
			query.before = { capturedAt: cursorCapturedAt, id: cursorId };
		}

		// The tallies are global and only needed for the first page, so a keyset
		// follow-up page (cursor present) skips them and just returns its rows.
		if (query.before) {
			const samples = await listLabelledSamples(query);
			return json({ ok: true, count: null, reviewCounts: null, samples });
		}
		const [samples, count, reviewCounts] = await Promise.all([
			listLabelledSamples(query),
			countLabelledSamples(),
			countSamplesByReviewStatus()
		]);
		return json({ ok: true, count, reviewCounts, samples });
	} catch (error) {
		return serverError(error, 'Failed to read labelled samples.');
	}
}
