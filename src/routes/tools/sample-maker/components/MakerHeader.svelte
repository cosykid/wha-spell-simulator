<!--
@component
The Sample Maker's top bar: the reference-glyph thumbnail, the sign's name and how many examples it
already has, and the action icons (reroll / pick / clear). Replaces the old side-panel header.
-->
<script lang="ts">
	import { getMakerSession } from '../maker-session.svelte.js';
	import HeaderActions from './HeaderActions.svelte';
	import SymbolThumb from './SymbolThumb.svelte';

	const session = getMakerSession();
</script>

<header class="maker-header">
	<SymbolThumb />
	{#if session.picker.current}
		<div class="title">
			<span class="name">{session.picker.current.displayName}</span>
			<span class="count">({session.currentCount})</span>
		</div>
	{/if}
	<div class="spacer"></div>
	<HeaderActions />
</header>

<style>
	.maker-header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
	}

	.title {
		display: flex;
		align-items: baseline;
		gap: 6px;
		min-width: 0;
	}

	.name {
		font-family: 'Cinzel', serif;
		font-size: 16px;
		font-weight: 600;
		color: var(--ink);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.count {
		font-size: 13px;
		color: var(--muted-ink);
		font-variant-numeric: tabular-nums;
	}

	.spacer {
		flex: 1 1 auto;
	}
</style>
