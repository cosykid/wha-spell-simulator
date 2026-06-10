import {
	countLabelledSamples,
	listLabelledSamples
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

/** Lists stored samples (optionally `?signId=`, `?limit=`) for verifying uploads. */
export async function GET({ url }) {
	try {
		const query: { signId?: string; limit?: number } = {};
		const signId = url.searchParams.get('signId');
		if (signId) {
			query.signId = signId;
		}
		const limit = Number(url.searchParams.get('limit'));
		if (Number.isFinite(limit) && limit > 0) {
			query.limit = limit;
		}

		const [samples, count] = await Promise.all([
			listLabelledSamples(query),
			countLabelledSamples()
		]);
		return json({ ok: true, count, samples });
	} catch (error) {
		return serverError(error, 'Failed to read labelled samples.');
	}
}
