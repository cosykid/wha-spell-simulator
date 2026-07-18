import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { resolveSession } from '$lib/server/auth/session.js';

const crossOriginIsolationHeaders = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'credentialless',
	'Cross-Origin-Resource-Policy': 'same-origin'
};

export const handle: Handle = async ({ event, resolve }) => {
	// Guests carry no session cookie, so this is a no-op for them. Any storage
	// hiccup (or a missing DATABASE_URL_VPS in db-less setups) degrades to guest.
	event.locals.user = building ? null : await resolveSession(event.cookies).catch(() => null);

	const response = await resolve(event);
	for (const [name, value] of Object.entries(crossOriginIsolationHeaders)) {
		response.headers.set(name, value);
	}
	return response;
};
