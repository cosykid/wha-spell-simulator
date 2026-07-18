/**
 * @file Hands a spell from the library book to the simulator canvas. The
 * library stashes the preset in sessionStorage and navigates home, and the
 * simulator page collects it once its canvas is ready. sessionStorage survives
 * the navigation but not the tab, which is exactly the lifetime wanted.
 */
import { SpellPresetDataSchema, type SpellPresetData } from '$lib/structures/spellPreset.js';

const PENDING_CAST_KEY = 'wha:pending-cast';

export function stashPendingCast(data: SpellPresetData): void {
	try {
		sessionStorage.setItem(PENDING_CAST_KEY, JSON.stringify(data));
	} catch {
		// Storage may be unavailable in private modes. The cast button then does nothing.
	}
}

/** Returns and clears the stashed preset, or null when absent or invalid. */
export function takePendingCast(): SpellPresetData | null {
	try {
		const raw = sessionStorage.getItem(PENDING_CAST_KEY);
		if (!raw) {
			return null;
		}
		sessionStorage.removeItem(PENDING_CAST_KEY);
		const parsed = SpellPresetDataSchema.safeParse(JSON.parse(raw));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}
