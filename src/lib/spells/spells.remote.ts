/**
 * @file Spell remote functions: everything that mutates saved spells. All of
 * them require a signed-in user. Reads go through `GET /api/spells` instead so
 * guests can browse the shared library.
 */
import { command, getRequestEvent } from '$app/server';
import { z } from 'zod';

import { MAX_PREVIEW_IR_BYTES, type SavedSpell } from '$lib/structures/savedSpell.js';
import { SpellPresetDataSchema } from '$lib/structures/spellPreset.js';
import type { SpellIR } from '$lib/types.js';
import {
	addSpellUpvote,
	deleteSpellOwned,
	insertSpell,
	removeSpellUpvote,
	setSpellPublished
} from '$lib/server/storage/spellStore.js';

export type SpellMutationFailure = 'auth-required' | 'not-found' | 'server-error';

export type SaveSpellResult =
	| { ok: true; spell: SavedSpell }
	| { ok: false; reason: SpellMutationFailure };

function currentUser(): { id: string; username: string } | null {
	return getRequestEvent().locals.user;
}

/** The IR is stored as an opaque blob for previews, so only its shape is checked. */
const PreviewIrSchema = z.looseObject({ valid: z.boolean(), element: z.unknown() }).nullable();

export const saveSpell = command(
	z.object({
		name: z.string().trim().min(1).max(60),
		data: SpellPresetDataSchema,
		previewIr: PreviewIrSchema,
		element: z.string().max(32).nullable()
	}),
	async ({ name, data, previewIr, element }): Promise<SaveSpellResult> => {
		const user = currentUser();
		if (!user) {
			return { ok: false, reason: 'auth-required' };
		}
		try {
			const storableIr =
				previewIr && JSON.stringify(previewIr).length <= MAX_PREVIEW_IR_BYTES
					? (previewIr as unknown as SpellIR)
					: null;
			const spell = await insertSpell({
				userId: user.id,
				name,
				data,
				previewIr: storableIr,
				element
			});
			return { ok: true, spell };
		} catch (error) {
			console.error('Failed to save spell:', error);
			return { ok: false, reason: 'server-error' };
		}
	}
);

export type SpellActionResult = { ok: true } | { ok: false; reason: SpellMutationFailure };

export const deleteSpell = command(
	z.object({ id: z.string().min(1) }),
	async ({ id }): Promise<SpellActionResult> => {
		const user = currentUser();
		if (!user) {
			return { ok: false, reason: 'auth-required' };
		}
		try {
			const removed = await deleteSpellOwned(id, user.id);
			return removed ? { ok: true } : { ok: false, reason: 'not-found' };
		} catch (error) {
			console.error('Failed to delete spell:', error);
			return { ok: false, reason: 'server-error' };
		}
	}
);

export type PublishSpellResult =
	| { ok: true; spell: SavedSpell }
	| { ok: false; reason: SpellMutationFailure };

/** Publishes a spell to the shared library, or retracts it again. */
export const setSpellVisibility = command(
	z.object({ id: z.string().min(1), published: z.boolean() }),
	async ({ id, published }): Promise<PublishSpellResult> => {
		const user = currentUser();
		if (!user) {
			return { ok: false, reason: 'auth-required' };
		}
		try {
			const spell = await setSpellPublished(id, user.id, published);
			return spell ? { ok: true, spell } : { ok: false, reason: 'not-found' };
		} catch (error) {
			console.error('Failed to change spell visibility:', error);
			return { ok: false, reason: 'server-error' };
		}
	}
);

export type UpvoteResult =
	| { ok: true; upvoteCount: number; upvoted: boolean }
	| { ok: false; reason: SpellMutationFailure };

/** Casts or withdraws this user's upvote on a published spell. Idempotent. */
export const setSpellUpvote = command(
	z.object({ id: z.string().min(1), upvoted: z.boolean() }),
	async ({ id, upvoted }): Promise<UpvoteResult> => {
		const user = currentUser();
		if (!user) {
			return { ok: false, reason: 'auth-required' };
		}
		try {
			const count = upvoted
				? await addSpellUpvote(id, user.id)
				: await removeSpellUpvote(id, user.id);
			return count === null
				? { ok: false, reason: 'not-found' }
				: { ok: true, upvoteCount: count, upvoted };
		} catch (error) {
			console.error('Failed to set spell upvote:', error);
			return { ok: false, reason: 'server-error' };
		}
	}
);
