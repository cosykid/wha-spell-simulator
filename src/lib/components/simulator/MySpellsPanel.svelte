<!--
@component
The My Spells drawer tab: the signed-in user's grimoire as a quick-load list.
A ledger line counts what is inscribed, then one MySpellRow per seal handles
load, share, and delete without leaving the canvas. Guests see a sign-in prompt.
-->
<script lang="ts">
	import { toast } from '@zerodevx/svelte-toast';
	import MySpellRow from './MySpellRow.svelte';
	import { getAuthState } from '$lib/ui/auth/auth-state.svelte.js';
	import type { SavedSpell } from '$lib/structures/savedSpell.js';
	import type { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';

	interface Props {
		simulator: SimulatorSession;
		/** Whether this tab is the one showing in the drawer. */
		active: boolean;
	}

	let { simulator, active }: Props = $props();
	const auth = getAuthState();
	let grimoire = $derived(simulator.grimoire);
	let sharedCount = $derived(grimoire.spells.filter((spell) => spell.publishedAt).length);

	/** The seal a command is running against, so its row can say so and lock. */
	let busy = $state<{ id: string; action: 'share' | 'delete' } | null>(null);

	/** The line the panel shows when the grimoire could not be read, and the way
	 * back from it. A failed read is not an empty grimoire. */
	let failure = $derived.by(() => {
		if (grimoire.error === 'auth') {
			return {
				text: 'Your sign-in has lapsed.',
				label: 'Sign in',
				run: () => auth.openDialog('login')
			};
		}
		if (grimoire.error === 'network') {
			return {
				text: 'The library could not be reached.',
				label: 'Try again',
				run: () => void grimoire.refresh()
			};
		}
		return null;
	});

	// Refresh whenever the tab becomes visible for a signed-in user, so the list
	// reflects saves made since it last opened.
	$effect(() => {
		if (active && auth.user) {
			void grimoire.refresh();
		}
	});

	function loadSpell(spell: SavedSpell) {
		if (simulator.actions.loadPreset(spell.data)) {
			toast.push(`“${spell.name}” drawn onto the canvas. Seal the ring to cast it.`);
		}
	}

	/** Signs the lapsed session out and resumes the command after a fresh one. */
	function retryAfterSignIn(retry: () => void) {
		auth.onSignedOut();
		void auth.requireUser(retry);
	}

	async function togglePublished(spell: SavedSpell) {
		const publishing = !spell.publishedAt;
		busy = { id: spell.id, action: 'share' };
		const result = await grimoire.setPublished(spell.id, publishing);
		busy = null;
		if (result.ok) {
			toast.push(
				publishing ? `“${spell.name}” shared to the library.` : `“${spell.name}” is private again.`
			);
		} else if (result.reason === 'auth-required') {
			retryAfterSignIn(() => void togglePublished(spell));
		} else {
			toast.push('That change did not take. Try again.');
		}
	}

	async function removeSpell(spell: SavedSpell) {
		busy = { id: spell.id, action: 'delete' };
		const result = await grimoire.remove(spell.id);
		busy = null;
		if (result.ok) {
			toast.push(`“${spell.name}” deleted.`);
		} else if (result.reason === 'auth-required') {
			retryAfterSignIn(() => void removeSpell(spell));
		} else {
			toast.push('That change did not take. Try again.');
		}
	}
</script>

<div class="my-spells" data-testid="my-spells-panel">
	{#if auth.loading}
		<p class="note">Consulting the ledger…</p>
	{:else if !auth.user}
		<p class="note">Sign in to keep spells here and recall them without redrawing.</p>
		<button
			type="button"
			class="signin"
			data-testid="my-spells-signin"
			onclick={() => auth.openDialog('login')}
		>
			Sign in
		</button>
	{:else}
		<p class="account">
			Signed in as <strong>{auth.user.username}</strong>
			<button
				type="button"
				class="ink-link"
				data-testid="my-spells-signout"
				onclick={() => void auth.signOut()}
			>
				Sign out
			</button>
		</p>
		{#if failure}
			<p class="note" data-testid="my-spells-error">
				{failure.text}
				<button type="button" class="ink-link" onclick={failure.run}>{failure.label}</button>
			</p>
		{/if}
		{#if grimoire.spells.length}
			<p class="tally">
				{grimoire.spells.length}
				{grimoire.spells.length === 1 ? 'seal' : 'seals'}
				{#if sharedCount > 0}<span class="tally-shared">· {sharedCount} shared</span>{/if}
			</p>
			<ul class="spell-list">
				{#each grimoire.spells as spell (spell.id)}
					<MySpellRow
						{spell}
						busyAction={busy?.id === spell.id ? busy.action : null}
						onLoad={() => loadSpell(spell)}
						onToggleShare={() => void togglePublished(spell)}
						onDelete={() => void removeSpell(spell)}
					/>
				{/each}
			</ul>
		{:else if grimoire.loading}
			<p class="note">Turning the pages…</p>
		{:else if !failure}
			<div class="empty">
				<svg class="empty-plate" viewBox="0 0 100 100" aria-hidden="true">
					<circle cx="50" cy="50" r="34" />
				</svg>
				<p class="note">Nothing inscribed yet.</p>
				<p class="note faint">
					Draw a spell, then press <strong>Save spell</strong> beside Undo and Clear to keep it here.
				</p>
			</div>
		{/if}
	{/if}
</div>

<style>
	.my-spells {
		display: grid;
		gap: 10px;
	}

	.note {
		margin: 0;
		font-size: 0.92rem;
		line-height: 1.45;
		color: var(--muted-ink);
	}

	.faint {
		font-size: 0.84rem;
		color: var(--ink-sepia-45);
	}

	.signin {
		min-height: 38px;
		padding: 0 16px;
		justify-self: start;
	}

	/* Who the drawer is showing, set small so it reads as a ledger note rather
	   than another control. */
	.account {
		display: flex;
		flex-wrap: wrap;
		gap: 2px 10px;
		align-items: baseline;
		margin: 0;
		font-size: 0.82rem;
		color: var(--ink-sepia-45);
	}

	.account strong {
		font-weight: 600;
		color: var(--ink-sepia-70);
	}

	/* A quiet inked link, the same voice as the row actions one level down. */
	.ink-link {
		min-height: 0;
		padding: 0 1px;
		border: 0;
		border-bottom: 1px solid var(--ink-sepia-20);
		border-radius: 0;
		background: none;
		box-shadow: none;
		font-size: 0.82rem;
		font-style: italic;
		color: var(--ink-sepia-70);
	}

	.ink-link:hover {
		background: none;
		border-bottom-color: var(--gold);
		color: var(--ink-sepia);
	}

	.ink-link:focus-visible {
		outline: 2px solid var(--gold);
		outline-offset: 2px;
	}

	/* An empty grimoire shows a bare ring: the seal waiting to be drawn. */
	.empty {
		display: grid;
		gap: 8px;
		justify-items: center;
		padding: 26px 12px 10px;
		text-align: center;
	}

	.empty-plate {
		width: 72px;
		height: 72px;
		opacity: 0.4;
	}

	.empty-plate circle {
		fill: none;
		stroke: var(--ink-sepia-45);
		stroke-width: 1.6;
		stroke-dasharray: 5 7;
		stroke-linecap: round;
	}

	/* Ledger heading: what the drawer holds, set small like a catalog line. */
	.tally {
		margin: 0;
		font-family: 'Cinzel', serif;
		font-size: 0.64rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--ink-sepia-45);
	}

	.tally-shared {
		color: var(--gold);
	}

	.spell-list {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
		border-top: 1px solid var(--ink-sepia-20);
	}
</style>
