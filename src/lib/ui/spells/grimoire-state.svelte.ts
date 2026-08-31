/**
 * @file The signed-in user's saved spells (their grimoire) as client state.
 * Backs the simulator's My Spells drawer tab and the library book's grimoire
 * section, each with its own instance. Mutations go through the spell remote
 * functions and the list is patched in place from their results.
 */
import {
	deleteSpell,
	saveSpell,
	setSpellVisibility,
	type SaveSpellResult,
	type PublishSpellResult,
	type SpellActionResult
} from '$lib/spells/spells.remote.js';
import type { SavedSpell } from '$lib/structures/savedSpell.js';
import type { SpellPresetData } from '$lib/structures/spellPreset.js';
import type { SpellIR } from '$lib/types.js';

/** Everything captured from the canvas when saving the current drawing. */
export interface SpellDraftInput {
	name: string;
	data: SpellPresetData;
	previewIr: SpellIR | null;
	element: string | null;
}

type RemoteSaveInput = Parameters<typeof saveSpell>[0];

/**
 * Why the grimoire could not be read. The session lapsing and the network
 * failing need different words and different ways out, and neither of them
 * means the reader has saved nothing.
 */
export type GrimoireError = 'auth' | 'network';

export class GrimoireState {
	spells = $state<SavedSpell[]>([]);
	loading = $state(false);
	/** Why the last refresh failed, or null when it worked. */
	error = $state<GrimoireError | null>(null);
	/** Whether the save-current-drawing dialog is open. */
	saveDialogOpen = $state(false);

	/** Reloads the grimoire from the server. Safe to call while signed out. */
	refresh = async (): Promise<void> => {
		this.loading = true;
		this.error = null;
		try {
			const response = await fetch('/api/spells?scope=mine');
			if (response.status === 401) {
				this.error = 'auth';
				return;
			}
			if (!response.ok) {
				throw new Error(`the grimoire answered ${response.status}`);
			}
			this.spells = (await response.json()).spells ?? [];
		} catch {
			// Keep the seals already listed. An empty grimoire and an unreachable
			// one read the same on screen otherwise, and only one is true.
			this.error = 'network';
		} finally {
			this.loading = false;
		}
	};

	save = async (draft: SpellDraftInput): Promise<SaveSpellResult> => {
		const result = await saveSpell(draft as unknown as RemoteSaveInput);
		if (result.ok) {
			this.spells = [result.spell, ...this.spells];
		}
		return result;
	};

	remove = async (id: string): Promise<SpellActionResult> => {
		const result = await deleteSpell({ id });
		if (result.ok) {
			this.spells = this.spells.filter((spell) => spell.id !== id);
		}
		return result;
	};

	setPublished = async (id: string, published: boolean): Promise<PublishSpellResult> => {
		const result = await setSpellVisibility({ id, published });
		if (result.ok) {
			this.spells = this.spells.map((spell) => (spell.id === id ? result.spell : spell));
		}
		return result;
	};
}
