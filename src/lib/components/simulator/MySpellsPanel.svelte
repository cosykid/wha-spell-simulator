<!--
@component
The My Spells drawer tab: the signed-in user's grimoire as a quick-load list.
Each entry shows a glyph thumbnail and offers load, publish, and delete without
leaving the canvas. Guests see a sign-in prompt instead.
-->
<script lang="ts">
	import { toast } from '@zerodevx/svelte-toast';
	import { getAuthState } from '$lib/ui/auth/auth-state.svelte.js';
	import { presetPreviewPolylines } from '$lib/ui/spells/presetThumbnail.js';
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

	async function togglePublished(spell: SavedSpell) {
		const publishing = !spell.publishedAt;
		const result = await grimoire.setPublished(spell.id, publishing);
		if (result.ok) {
			toast.push(
				publishing ? `“${spell.name}” shared to the library.` : `“${spell.name}” is private again.`
			);
		} else {
			toast.push('That change did not take. Try again.');
		}
	}

	async function removeSpell(spell: SavedSpell) {
		const result = await grimoire.remove(spell.id);
		toast.push(
			result.ok ? `“${spell.name}” torn from the grimoire.` : 'That change did not take. Try again.'
		);
	}
</script>

<div class="my-spells" data-testid="my-spells-panel">
	{#if auth.loading}
		<p class="spells-empty">Consulting the ledger…</p>
	{:else if !auth.user}
		<p class="spells-empty">Sign in to keep spells here and recall them without redrawing.</p>
		<button
			type="button"
			class="spells-signin"
			data-testid="my-spells-signin"
			onclick={() => auth.openDialog('login')}
		>
			Sign in
		</button>
	{:else if grimoire.loading && grimoire.spells.length === 0}
		<p class="spells-empty">Turning the pages…</p>
	{:else if grimoire.spells.length === 0}
		<p class="spells-empty">
			Nothing inscribed yet. Draw a spell, then press the Save spell button beside Undo and Clear.
		</p>
	{:else}
		<ul class="spell-list">
			{#each grimoire.spells as spell (spell.id)}
				<li class="spell-card" data-testid="spell-card">
					<button
						type="button"
						class="spell-main"
						data-testid="spell-load-button"
						title="Draw this spell onto the canvas"
						onclick={() => loadSpell(spell)}
					>
						<svg class="spell-thumb" viewBox="0 0 100 100" aria-hidden="true">
							{#each presetPreviewPolylines(spell.data) as points (points)}
								<polyline {points} />
							{/each}
						</svg>
						<span class="spell-meta">
							<span class="spell-name">{spell.name}</span>
							<span class="spell-sub">
								{spell.element ?? 'unknown'}
								{#if spell.publishedAt}
									· shared · ▲{spell.upvoteCount}
								{/if}
							</span>
						</span>
					</button>
					<span class="spell-actions">
						<button
							type="button"
							class="spell-action"
							data-testid="spell-publish-toggle"
							onclick={() => togglePublished(spell)}
						>
							{spell.publishedAt ? 'Unshare' : 'Share'}
						</button>
						<button
							type="button"
							class="spell-action spell-delete"
							data-testid="spell-delete-button"
							onclick={() => removeSpell(spell)}
						>
							Delete
						</button>
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.my-spells {
		display: grid;
		gap: 12px;
	}

	.spells-empty {
		margin: 0;
		font-size: 0.92rem;
		color: var(--muted-ink);
	}

	.spells-signin {
		min-height: 38px;
		padding: 0 16px;
		justify-self: start;
	}

	.spell-list {
		display: grid;
		gap: 10px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.spell-card {
		display: grid;
		gap: 6px;
		padding: 10px;
		border: 1px solid var(--ink-sepia-20);
		border-radius: var(--radius);
		background: var(--chrome-glass);
	}

	.spell-main {
		display: flex;
		gap: 12px;
		align-items: center;
		padding: 0;
		border: none;
		background: none;
		box-shadow: none;
		text-align: left;
		cursor: pointer;
	}

	.spell-thumb {
		flex: 0 0 56px;
		width: 56px;
		height: 56px;
		border: 1px solid var(--ink-sepia-20);
		border-radius: 6px;
		background: var(--panel);
	}

	.spell-thumb polyline {
		fill: none;
		stroke: var(--ink);
		stroke-width: 2.4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.spell-meta {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	.spell-name {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.spell-sub {
		font-size: 0.82rem;
		color: var(--muted-ink);
		text-transform: capitalize;
	}

	.spell-actions {
		display: flex;
		gap: 8px;
	}

	.spell-action {
		min-height: 30px;
		padding: 0 12px;
		font-size: 0.82rem;
	}

	.spell-delete {
		color: var(--ember);
	}
</style>
