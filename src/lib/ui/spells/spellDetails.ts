/**
 * @file Fetches the drawing behind a spell card, once per spell.
 *
 * A card carries only its thumbnail, so opening or previewing a spell has to go
 * back for the drawing. Requests are kept by id, which both dedupes a card that
 * is hovered and then clicked and makes a second visit to the same plate free.
 */
import type { SpellDetail } from '$lib/structures/savedSpell.js';

export class SpellDetails {
	#pending = new Map<string, Promise<SpellDetail | null>>();

	/** The drawing for one spell, or null when it could not be read. */
	load(id: string): Promise<SpellDetail | null> {
		const cached = this.#pending.get(id);
		if (cached) {
			return cached;
		}
		const request = this.#fetch(id);
		this.#pending.set(id, request);
		return request;
	}

	/**
	 * Starts the fetch without waiting for it, so a reader who moves onto a plate
	 * and then clicks it has the drawing already in hand.
	 */
	prefetch(id: string): void {
		void this.load(id);
	}

	/** Forgets one spell, so the next read sees an edit made since. */
	forget(id: string): void {
		this.#pending.delete(id);
	}

	async #fetch(id: string): Promise<SpellDetail | null> {
		try {
			const response = await fetch(`/api/spells/${encodeURIComponent(id)}`);
			if (!response.ok) {
				throw new Error(`the spell answered ${response.status}`);
			}
			return (await response.json()).spell ?? null;
		} catch {
			// Dropped so the next attempt is a fresh request rather than a
			// remembered failure.
			this.#pending.delete(id);
			return null;
		}
	}
}
