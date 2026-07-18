// Ambient SvelteKit app types. `locals.user` is populated by the session hook.
declare global {
	namespace App {
		interface Locals {
			/** The signed-in account for this request, or null for guests. */
			user: { id: string; username: string } | null;
		}
	}
}

export {};
