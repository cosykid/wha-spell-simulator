import { setSampleReviewStatus } from '$lib/server/storage/labelledSampleStore.js';

import type { SampleReview } from '$lib/structures/labelledSample.js';
import { command } from '$app/server';
import { z } from 'zod';

/** What {@link setReviewStatus} resolves to client-side. */
export type SetReviewStatusResult =
	| { ok: true; review: SampleReview | null }
	| { ok: false; reason: 'not-found' | 'server-error' };

/**
 * Records the manual QA verdict on one stored sample, or clears it again with
 * `status: null`. A verdict only marks the row — rejected samples are never
 * deleted, so they can be re-inspected or un-rejected later.
 */
export const setReviewStatus = command(
	z.object({
		id: z.string().min(1),
		status: z.enum(['approved', 'rejected']).nullable()
	}),
	async ({ id, status }): Promise<SetReviewStatusResult> => {
		try {
			const sample = await setSampleReviewStatus(id, status);
			return sample ? { ok: true, review: sample.review } : { ok: false, reason: 'not-found' };
		} catch (error) {
			console.error('Failed to set review status:', error);
			return { ok: false, reason: 'server-error' };
		}
	}
);
