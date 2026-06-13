<!--
@component
A single phase-relevant instruction line, shown between the canvas and the action bar.
-->
<script lang="ts">
	import { getMakerSession } from '../maker-session.svelte.js';

	const session = getMakerSession();
</script>

<p class="instructions">
	{#if session.phase === 'draw'}
		Draw the sign shown above freehand, by eye, at the orientation shown. Tap
		<strong>Label</strong> when you're happy.
	{:else}
		Drag the reference glyph to match your drawing — pinch to scale &amp; rotate, then
		<strong>Fit</strong> to fine-tune.
	{/if}
</p>

<style>
	.instructions {
		margin: 0;
		padding: 8px 12px;
		font-size: 16px;
		line-height: 1.5;
		text-align: center;
		color: var(--muted-ink);
	}
</style>
