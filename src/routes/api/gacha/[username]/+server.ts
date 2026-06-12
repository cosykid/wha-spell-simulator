import { json } from '@sveltejs/kit';
import {
	getOrCreateProfile,
	patchProfile,
	type GachaProfilePatch
} from '$lib/server/storage/gachaProfileStore.js';

export const prerender = false;

function serverError(error: unknown): Response {
	return json(
		{ ok: false, error: error instanceof Error ? error.message : 'Internal server error' },
		{ status: 500 }
	);
}

function badRequest(message: string): Response {
	return json({ ok: false, error: message }, { status: 400 });
}

/** GET /api/gacha/:username — fetch or initialise a profile */
export async function GET({ params }: { params: { username: string } }) {
	const username = params.username?.trim();
	if (!username) return badRequest('Username is required.');
	try {
		const profile = await getOrCreateProfile(username);
		return json({ ok: true, profile });
	} catch (error) {
		return serverError(error);
	}
}

/** PATCH /api/gacha/:username — update currency, inventories, pull dates, and active cosmetics */
export async function PATCH({
	params,
	request
}: {
	params: { username: string };
	request: Request;
}) {
	const username = params.username?.trim();
	if (!username) return badRequest('Username is required.');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return badRequest('Request body must be JSON.');
	}

	if (!body || typeof body !== 'object') return badRequest('Request body must be an object.');

	const patch: GachaProfilePatch = {};
	const b = body as Record<string, unknown>;

	if (typeof b.currency === 'number') patch.currency = Math.max(0, Math.floor(b.currency));
	if (b.inventory && typeof b.inventory === 'object' && !Array.isArray(b.inventory))
		patch.inventory = b.inventory as Record<string, number>;
	if (
		b.cosmeticInventory &&
		typeof b.cosmeticInventory === 'object' &&
		!Array.isArray(b.cosmeticInventory)
	)
		patch.cosmeticInventory = b.cosmeticInventory as Record<string, number>;
	if (b.freePullDate === null || typeof b.freePullDate === 'string')
		patch.freePullDate = b.freePullDate as string | null;
	if (b.cosmeticFreePullDate === null || typeof b.cosmeticFreePullDate === 'string')
		patch.cosmeticFreePullDate = b.cosmeticFreePullDate as string | null;
	if (b.activeInkColorId === null || typeof b.activeInkColorId === 'string')
		patch.activeInkColorId = b.activeInkColorId as string | null;
	if (b.activeEffectId === null || typeof b.activeEffectId === 'string')
		patch.activeEffectId = b.activeEffectId as string | null;

	try {
		const profile = await patchProfile(username, patch);
		return json({ ok: true, profile });
	} catch (error) {
		return serverError(error);
	}
}
