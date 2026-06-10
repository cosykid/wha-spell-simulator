import {
	DuplicateSampleError,
	insertLabelledSample
} from '$lib/server/storage/labelledSampleStore.js';

import type { SampleSubmission } from '$lib/structures/labelledSample.js';
import { form } from '$app/server';
import { invalid } from '@sveltejs/kit';
import { z } from 'zod';

const finite = z.number().refine(Number.isFinite, 'must be a finite number');

const PointSchema = z.object({
	x: finite,
	y: finite,
	t: finite
});

/** Mirrors {@link SampleSubmission}; the server assigns `id` and `capturedAt`. */
const SampleSubmissionSchema = z.object({
	data: z.array(z.array(PointSchema).min(1)).min(1),
	label: z.object({
		signId: z.string().min(1),
		scale_x: finite,
		scale_y: finite,
		translate_x: finite,
		translate_y: finite,
		angle: finite
	}),
	meta: z.object({
		referenceSize: finite,
		canvasWidth: finite,
		canvasHeight: finite,
		devicePixelRatio: finite,
		sessionId: z.string().optional(),
		contributorId: z.string().optional(),
		discordUsername: z.string().trim().max(64).optional()
	})
});

function formatIssues(error: z.ZodError): string {
	return error.issues
		.map((issue) => {
			const path = issue.path.join('.');
			return path ? `${path}: ${issue.message}` : issue.message;
		})
		.join('; ');
}

/** What {@link submitSample} resolves to, exposed as `submitSample.result`. */
export type SubmitSampleResult =
	| { ok: true; id: string }
	| { ok: false; reason: 'duplicate' }
	| { ok: false; reason: 'server-error' };

/**
 * Stores one labelled sample. The whole {@link SampleSubmission} is carried as a single
 * JSON string field rather than a tree of `<input>`s: the strokes are variable-length
 * nested arrays captured from the canvas, not values a user types, so modelling them as
 * form fields would be more awkward than helpful. We still validate the decoded payload
 * against {@link SampleSubmissionSchema} on the server.
 *
 * A byte-identical drawing already on record resolves to `{ ok: false, reason: 'duplicate' }`
 * (the store rejects it via the `data_hash` unique constraint) rather than being stored twice.
 */
export const submitSample = form(
	z.object({ payload: z.string() }),
	async ({ payload }, issue): Promise<SubmitSampleResult> => {
		let decoded: unknown;
		try {
			decoded = JSON.parse(payload);
		} catch {
			invalid(issue.payload('The sample payload was not valid JSON.'));
		}

		const parsed = SampleSubmissionSchema.safeParse(decoded);
		if (!parsed.success) {
			invalid(issue.payload(formatIssues(parsed.error)));
		}

		try {
			const sample = await insertLabelledSample(parsed.data as SampleSubmission);
			return { ok: true, id: sample.id };
		} catch (error) {
			if (error instanceof DuplicateSampleError) {
				return { ok: false, reason: 'duplicate' };
			}
			console.error('Failed to insert labelled sample:', error);
			return { ok: false, reason: 'server-error' };
		}
	}
);
