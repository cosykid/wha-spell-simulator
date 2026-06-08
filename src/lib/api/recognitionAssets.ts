import { browser } from '$app/environment';
import { resolve } from '$app/paths';

import type { RecognitionExample } from '../parser/shapeMatcher.js';

export interface RecognitionAssets {
	available: boolean;
	modelVersion: string | null;
	recognitionExamples: RecognitionExample[];
}

const EMPTY_ASSETS: RecognitionAssets = {
	available: false,
	modelVersion: null,
	recognitionExamples: []
};

export async function loadRecognitionAssets(
	fetcher: typeof fetch = fetch
): Promise<RecognitionAssets> {
	if (!browser) {
		return EMPTY_ASSETS;
	}

	try {
		const response = await fetcher(resolve('/api/recognition/assets'));
		const contentType = response.headers.get('content-type') ?? '';
		if (!response.ok || !contentType.includes('application/json')) {
			return EMPTY_ASSETS;
		}
		const payload = (await response.json()) as Partial<RecognitionAssets>;
		return {
			available: Boolean(payload.available),
			modelVersion: typeof payload.modelVersion === 'string' ? payload.modelVersion : null,
			recognitionExamples: Array.isArray(payload.recognitionExamples)
				? payload.recognitionExamples
				: []
		};
	} catch {
		return EMPTY_ASSETS;
	}
}
