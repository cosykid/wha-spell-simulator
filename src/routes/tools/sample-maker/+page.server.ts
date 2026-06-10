import { countSamplesBySignId } from '$lib/server/storage/labelledSampleStore.js';

import type { PageServerLoad } from './$types';

export const prerender = false;

export const load = (async () => {
	try {
		return {
			sampleCounts: await countSamplesBySignId()
		};
	} catch (error) {
		console.warn('Sample Maker could not load per-sign sample counts:', error);
		return {
			sampleCounts: []
		};
	}
}) satisfies PageServerLoad;
