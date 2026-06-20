import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';

const crossOriginIsolationHeaders = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'credentialless',
	'Cross-Origin-Resource-Policy': 'same-origin'
};

function crossOriginIsolationPlugin(): Plugin {
	const applyHeaders = (
		_request: unknown,
		response: { setHeader: (name: string, value: string) => void },
		next: () => void
	) => {
		for (const [name, value] of Object.entries(crossOriginIsolationHeaders)) {
			response.setHeader(name, value);
		}
		next();
	};

	return {
		name: 'cross-origin-isolation-headers',
		configureServer(server) {
			server.middlewares.use(applyHeaders);
		},
		configurePreviewServer(server) {
			server.middlewares.use(applyHeaders);
		}
	};
}

export default defineConfig({
	plugins: [crossOriginIsolationPlugin(), sveltekit()],
	server: {
		headers: crossOriginIsolationHeaders
	},
	preview: {
		headers: crossOriginIsolationHeaders
	}
});
