import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Static build suitable for GitHub Pages.
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: '404.html',
			precompress: false
		}),
		// Emit relative asset/import URLs so the prerendered site works from any
		// subpath (e.g. https://<user>.github.io/wha-spell-simulator/).
		paths: {
			relative: true
		}
	}
};

export default config;
