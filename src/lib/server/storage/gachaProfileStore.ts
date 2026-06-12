import { getDb, type Db } from './neon.js';

export interface GachaProfile {
	discordUsername: string;
	currency: number;
	inventory: Record<string, number>;
	cosmeticInventory: Record<string, number>;
	freePullDate: string | null;
	cosmeticFreePullDate: string | null;
	activeInkColorId: string | null;
	activeEffectId: string | null;
}

const STARTER_CURRENCY = 200;
const STARTER_INVENTORY: Record<string, number> = { earth: 1, fire: 1, water: 1 };

function rowToProfile(row: {
	discord_username: string;
	currency: number;
	inventory: Record<string, number>;
	cosmetic_inventory: Record<string, number>;
	free_pull_date: string | null;
	cosmetic_free_pull_date: string | null;
	active_ink_color_id: string | null;
	active_effect_id: string | null;
}): GachaProfile {
	return {
		discordUsername: row.discord_username,
		currency: row.currency,
		inventory: row.inventory ?? {},
		cosmeticInventory: row.cosmetic_inventory ?? {},
		freePullDate: row.free_pull_date,
		cosmeticFreePullDate: row.cosmetic_free_pull_date,
		activeInkColorId: row.active_ink_color_id ?? null,
		activeEffectId: row.active_effect_id ?? null
	};
}

const PROFILE_COLUMNS = [
	'discord_username',
	'currency',
	'inventory',
	'cosmetic_inventory',
	'free_pull_date',
	'cosmetic_free_pull_date',
	'active_ink_color_id',
	'active_effect_id'
] as const;

/** Fetches or creates a profile for the given Discord username. */
export async function getOrCreateProfile(
	username: string,
	db: Db = getDb()
): Promise<GachaProfile> {
	const normalized = username.trim().toLowerCase();
	// Upsert: create with starter values on first visit, return existing on repeat.
	const row = await db
		.insertInto('gacha_profiles')
		.values({
			discord_username: normalized,
			currency: STARTER_CURRENCY,
			inventory: JSON.stringify(STARTER_INVENTORY),
			cosmetic_inventory: JSON.stringify({})
		})
		.onConflict((oc) => oc.column('discord_username').doNothing())
		.returning(PROFILE_COLUMNS)
		.executeTakeFirst();

	if (row) {
		return rowToProfile(row as Parameters<typeof rowToProfile>[0]);
	}

	// Row already existed; fetch it.
	const existing = await db
		.selectFrom('gacha_profiles')
		.select(PROFILE_COLUMNS)
		.where('discord_username', '=', normalized)
		.executeTakeFirstOrThrow();

	return rowToProfile(existing as Parameters<typeof rowToProfile>[0]);
}

export type GachaProfilePatch = Partial<{
	currency: number;
	inventory: Record<string, number>;
	cosmeticInventory: Record<string, number>;
	freePullDate: string | null;
	cosmeticFreePullDate: string | null;
	activeInkColorId: string | null;
	activeEffectId: string | null;
}>;

/** Applies a partial update to an existing profile and returns the updated record. */
export async function patchProfile(
	username: string,
	patch: GachaProfilePatch,
	db: Db = getDb()
): Promise<GachaProfile> {
	const normalized = username.trim().toLowerCase();
	const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
	if (patch.currency !== undefined) updates.currency = patch.currency;
	if (patch.inventory !== undefined) updates.inventory = JSON.stringify(patch.inventory);
	if (patch.cosmeticInventory !== undefined)
		updates.cosmetic_inventory = JSON.stringify(patch.cosmeticInventory);
	if (patch.freePullDate !== undefined) updates.free_pull_date = patch.freePullDate;
	if (patch.cosmeticFreePullDate !== undefined)
		updates.cosmetic_free_pull_date = patch.cosmeticFreePullDate;
	if (patch.activeInkColorId !== undefined) updates.active_ink_color_id = patch.activeInkColorId;
	if (patch.activeEffectId !== undefined) updates.active_effect_id = patch.activeEffectId;

	const row = await db
		.updateTable('gacha_profiles')
		.set(updates)
		.where('discord_username', '=', normalized)
		.returning(PROFILE_COLUMNS)
		.executeTakeFirstOrThrow();

	return rowToProfile(row as Parameters<typeof rowToProfile>[0]);
}
