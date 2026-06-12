<!--
@component
The desktop side panel: a large rotated preview of the suggested sign (with its name and example
count), a full-width reroll button plus Clear, and the always-expanded {@link Labels} grid so a
sign can be picked without the slide-up sheet. Hidden at 1050px and below, where {@link MakerHeader}'s
compact row takes over: below that width styles.css stops height-locking the app shell, and without
a bounded height the label grid would stretch the page instead of scrolling.
-->
<script lang="ts">
	import { getSymbolSvg } from '$lib/dictionary/svgStrokes.js';
	import { RotateCw } from 'lucide-svelte';
	import Labels from '../Labels.svelte';
	import { getMakerSession } from '../maker-session.svelte.js';
	import { SAMPLE_SYMBOLS } from '../symbols.js';
	import ClearButton from './ClearButton.svelte';

	const session = getMakerSession();
</script>

<aside class="maker-sidebar">
	{#if session.picker.current}
		<div class="preview">
			<!-- Rotated to the suggested angle (positive degrees turn clockwise, matching the canvas)
			     and shrunk so the rotated bounding box stays inside the square frame. -->
			<span
				class="preview-glyph"
				style="transform: rotate({session.rotationDeg}deg) scale({session.previewScale})"
			>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html getSymbolSvg(session.picker.current.id)}
			</span>
			<div class="preview-title">
				<span class="name">{session.picker.current.displayName}</span>
				<span class="count">({session.currentCount})</span>
			</div>
		</div>
	{/if}

	<div class="actions">
		<button type="button" class="reroll" onclick={() => session.suggest()}>
			<RotateCw size={18} />
			Random sign
		</button>
		<ClearButton />
	</div>

	<div class="sidebar-labels">
		<Labels
			symbols={SAMPLE_SYMBOLS}
			selectedId={session.picker.current?.id ?? null}
			onpick={(symbol) => session.suggest(symbol)}
		/>
	</div>
</aside>

<style>
	.maker-sidebar {
		display: none;
	}

	@media (min-width: 1051px) {
		.maker-sidebar {
			display: flex;
			flex-direction: column;
			gap: 12px;
			flex: 0 0 300px;
			min-height: 0;
			padding: 12px;
			border-right: 1px solid rgba(36, 27, 22, 0.14);
		}
	}

	.preview {
		display: grid;
		justify-items: center;
		gap: 8px;
		padding: 14px;
		border: 1px solid rgba(31, 111, 115, 0.85);
		border-radius: 8px;
		background: rgba(31, 111, 115, 0.14);
	}

	.preview-glyph {
		display: flex;
		align-items: center;
		justify-content: center;
		width: min(100%, 200px);
		aspect-ratio: 1;
	}

	.preview-glyph :global(svg) {
		width: 100%;
		height: 100%;
		overflow: visible;
	}

	.preview-title {
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

	.actions {
		display: flex;
		align-items: stretch;
		gap: 8px;
	}

	.reroll {
		flex: 1 1 auto;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}

	.sidebar-labels {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
	}
</style>
