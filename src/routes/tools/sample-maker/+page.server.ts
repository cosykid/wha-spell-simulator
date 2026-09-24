import { countSamplesBySignId } from '$lib/server/storage/labelledSampleStore.js';
import { PUBLIC_AGGREGATE_CACHE } from '../../api/cache.js';

import type { PageServerLoad } from './$types';

export const prerender = false;

export const load = (async ({ setHeaders }) => {
	try {
		const sampleCounts = await countSamplesBySignId();
		setHeaders({ 'cache-control': PUBLIC_AGGREGATE_CACHE });
		return { sampleCounts };
	} catch (error) {
		console.warn('Sample Maker could not load per-sign sample counts:', error);
		return {
			sampleCounts: []
		};
	}
}) satisfies PageServerLoad;
