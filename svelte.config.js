import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			runtime: 'nodejs22.x',
			// Sit beside the database. Every uncached request makes at least one
			// query, and Neon lives in ap-southeast-2, so a function in Vercel's
			// default iad1 pays a trans-Pacific round trip per query (~200ms
			// measured). One hop from a far-away reader to here costs less than
			// that hop repeated for each query.
			regions: ['syd1']
		}),
		// Opt in to remote functions (`*.remote.ts`), used by the Sample Maker submit flow.
		experimental: {
			remoteFunctions: true
		},
		// Keep generated asset/import URLs relative so previews and custom domains
		// do not depend on a hard-coded deployment origin.
		paths: {
			relative: true
		},
		alias: {
			$config: 'src/lib/config.ts',
			$canvas: 'src/lib/ui/canvas'
		}
	}
};

export default config;
