import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			runtime: 'nodejs22.x'
		}),
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
