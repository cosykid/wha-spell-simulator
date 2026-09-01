<!--
@component
One entry of the grimoire drawer: the seal shown large on its plate, the spell's
caption beside it, and ink actions standing under the caption. Deleting asks once
before it takes, since a seal cannot be recovered after it goes.
-->
<script lang="ts">
	import { presetPreviewPolylines } from '$lib/ui/spells/presetThumbnail.js';
	import type { SavedSpell } from '$lib/structures/savedSpell.js';

	interface Props {
		spell: SavedSpell;
		/** The command running against this seal, which locks both actions. */
		busyAction?: 'share' | 'delete' | null;
		onLoad: () => void;
		onToggleShare: () => void;
		onDelete: () => void;
	}

	let { spell, busyAction = null, onLoad, onToggleShare, onDelete }: Props = $props();

	let confirmingDelete = $state(false);
	let busy = $derived(busyAction !== null);

	let inscribed = $derived.by(() => {
		const date = new Date(spell.updatedAt);
		return Number.isNaN(date.getTime())
			? null
			: date.toLocaleDateString('en', { month: 'short', year: 'numeric' });
	});

	function deleteClicked() {
		if (!confirmingDelete) {
			confirmingDelete = true;
			return;
		}
		confirmingDelete = false;
		onDelete();
	}
</script>

<li
	class="row"
	data-testid="spell-card"
	onmouseleave={() => (confirmingDelete = false)}
	onfocusout={(event) => {
		if (!event.currentTarget.contains(event.relatedTarget as Node)) confirmingDelete = false;
	}}
>
	<button
		type="button"
		class="seal"
		data-testid="spell-load-button"
		title="Draw this spell onto the canvas"
		onclick={onLoad}
	>
		<svg class="plate" viewBox="0 0 100 100" aria-hidden="true">
			{#each presetPreviewPolylines(spell.data) as points (points)}
				<polyline {points} />
			{/each}
		</svg>
	</button>

	<div class="caption">
		<button type="button" class="name" title="Draw this spell onto the canvas" onclick={onLoad}>
			{spell.name}
		</button>
		<span class="sub">
			<span class="element">{spell.element ?? 'unknown'}</span>
			{#if inscribed}<span class="inscribed">{inscribed}</span>{/if}
			{#if spell.publishedAt}
				<span class="likes" title="Likes in the shared library">
					<svg class="thumb" viewBox="0 0 24 24" aria-hidden="true">
						<path
							d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"
						/>
					</svg>
					{spell.upvoteCount}
				</span>
			{/if}
		</span>

		<div class="actions">
			<button
				type="button"
				class="ink-action"
				data-testid="spell-publish-toggle"
				title={spell.publishedAt
					? 'Take this spell back out of the shared library'
					: 'Show this spell in the shared library'}
				disabled={busy}
				onclick={onToggleShare}
			>
				{#if busyAction === 'share'}
					{spell.publishedAt ? 'Unsharing…' : 'Sharing…'}
				{:else}
					{spell.publishedAt ? 'Unshare' : 'Share'}
				{/if}
			</button>
			<button
				type="button"
				class="ink-action delete"
				class:confirming={confirmingDelete}
				data-testid="spell-delete-button"
				disabled={busy}
				onclick={deleteClicked}
			>
				{#if busyAction === 'delete'}
					Removing…
				{:else}
					{confirmingDelete ? 'Delete for good?' : 'Delete'}
				{/if}
			</button>
		</div>
	</div>
</li>

<style>
	/* Ruled entries in a ledger, not stacked cards: the seal carries the row. */
	.row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 14px;
		align-items: center;
		padding: 14px 2px;
		border-bottom: 1px solid var(--ink-sepia-20);
	}

	.seal {
		padding: 0;
		border: none;
		border-radius: 0;
		background: none;
		box-shadow: none;
		cursor: pointer;
	}

	.seal:hover {
		background: none;
	}

	.seal:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 3px;
	}

	.plate {
		display: block;
		width: 104px;
		height: 104px;
		border: 1px solid var(--ink-sepia-20);
		background: var(--chrome-glass);
		transition:
			border-color 160ms ease,
			background 160ms ease;
	}

	.plate polyline {
		fill: none;
		stroke: var(--ink-sepia);
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.row:has(.seal:hover, .name:hover) .plate {
		border-color: var(--accent);
		background: var(--chrome-glass-strong);
	}

	.caption {
		display: grid;
		gap: 6px;
		min-width: 0;
	}

	/* The name loads the spell too, so the whole entry is one target. */
	.name {
		min-height: 0;
		padding: 0;
		border: none;
		border-radius: 0;
		background: none;
		box-shadow: none;
		font-family: 'Cinzel', serif;
		font-weight: 600;
		font-size: 1rem;
		line-height: 1.2;
		text-align: left;
		color: var(--ink-sepia);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		cursor: pointer;
	}

	.name:hover {
		background: none;
		color: var(--accent);
	}

	.name:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.sub {
		display: flex;
		flex-wrap: wrap;
		gap: 3px 8px;
		align-items: center;
	}

	/* Element names read as a small inked stamp, matching the library plates. */
	.element {
		padding: 1px 6px;
		border: 1px solid var(--ink-sepia-45);
		font-size: 0.62rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-sepia-70);
	}

	.inscribed {
		font-size: 0.76rem;
		font-style: italic;
		color: var(--muted-ink);
	}

	.likes {
		display: inline-flex;
		gap: 4px;
		align-items: center;
		font-size: 0.76rem;
		color: var(--accent);
	}

	.thumb {
		width: 12px;
		height: 12px;
		fill: currentColor;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 14px;
		margin-top: 2px;
	}

	.ink-action {
		min-height: 0;
		padding: 2px 1px;
		border: 0;
		border-bottom: 1px solid var(--ink-sepia-20);
		border-radius: 0;
		background: none;
		box-shadow: none;
		font-size: 0.74rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-sepia-70);
	}

	.ink-action:hover {
		background: none;
		border-bottom-color: var(--accent);
		color: var(--ink-sepia);
	}

	.ink-action:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.delete:hover,
	.delete.confirming {
		color: var(--ember);
		border-bottom-color: var(--ember);
	}
</style>
