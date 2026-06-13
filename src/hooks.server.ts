import type { Handle } from '@sveltejs/kit';

const crossOriginIsolationHeaders = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'require-corp',
	'Cross-Origin-Resource-Policy': 'same-origin'
};

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	for (const [name, value] of Object.entries(crossOriginIsolationHeaders)) {
		response.headers.set(name, value);
	}
	return response;
};
