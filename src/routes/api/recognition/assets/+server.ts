import { json } from '@sveltejs/kit';

import { listRecognitionExamples } from '$lib/server/storage/recognitionExampleStore.js';

export const prerender = false;

export async function GET() {
	try {
		const recognitionExamples = await listRecognitionExamples();

		return json({
			available: true,
			modelVersion: null,
			recognitionExamples
		});
	} catch (error) {
		return json({
			available: false,
			modelVersion: null,
			recognitionExamples: [],
			reason: error instanceof Error ? error.message : 'Recognition assets unavailable'
		});
	}
}
