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
 * `?limit=`) for verifying uploads and backing the Sample Reviewer.
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
		const limit = Number(url.searchParams.get('limit'));
		if (Number.isFinite(limit) && limit > 0) {
			query.limit = limit;
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
