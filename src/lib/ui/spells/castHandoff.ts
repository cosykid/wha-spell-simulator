/**
 * @file Hands a spell from the library book to the simulator canvas. The
 * library stashes the preset in sessionStorage and navigates home, and the
 * simulator page collects it once its canvas is ready. sessionStorage survives
 * the navigation but not the tab, which is exactly the lifetime wanted.
 */
import { SpellPresetDataSchema, type SpellPresetData } from '$lib/structures/spellPreset.js';

const PENDING_CAST_KEY = 'wha:pending-cast';

/**
 * Stashes a preset for the simulator to collect. Returns whether it stuck, so
 * a caller does not navigate away from a handoff that never happened.
 *
 * @example
 * ```ts
 * if (stashPendingCast(spell.data)) await goto(resolve('/'));
 * ```
 */
export function stashPendingCast(data: SpellPresetData): boolean {
	try {
		sessionStorage.setItem(PENDING_CAST_KEY, JSON.stringify(data));
		return true;
	} catch {
		// Storage is unavailable in some private modes, and a full quota throws too.
		return false;
	}
}

/** Whether a stashed preset is still waiting, without taking it. */
export function hasPendingCast(): boolean {
	try {
		return sessionStorage.getItem(PENDING_CAST_KEY) !== null;
	} catch {
		return false;
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
