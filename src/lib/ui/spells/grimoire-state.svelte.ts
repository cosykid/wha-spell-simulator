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

export class GrimoireState {
	spells = $state<SavedSpell[]>([]);
	loading = $state(false);
	/** Whether the save-current-drawing dialog is open. */
	saveDialogOpen = $state(false);

	/** Reloads the grimoire from the server. Safe to call while signed out. */
	refresh = async (): Promise<void> => {
		this.loading = true;
		try {
			const response = await fetch('/api/spells?scope=mine');
			this.spells = response.ok ? ((await response.json()).spells ?? []) : [];
		} catch {
			this.spells = [];
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
