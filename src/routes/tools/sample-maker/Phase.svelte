<!--
@component
A numbered step in the Dataset Builder side panel: a circled `step` number, a `title`, an
optional `intro` paragraph, and the step's body (`children`). Keeps the phase styling in one
place so the Sample Maker's panels read as a consistent, ordered progression.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** The 1-based step number shown in the badge. */
		step: number;
		/** The step heading. */
		title: string;
		/** Optional introductory text rendered above the body. */
		intro?: Snippet;
		/** The step's content (controls, preview, form…). */
		children: Snippet;
	}

	let { step, title, intro, children }: Props = $props();
</script>

<section class="phase">
	<h3 class="phase-title"><span class="phase-step">{step}</span> {title}</h3>
	{#if intro}
		<p class="phase-intro">{@render intro()}</p>
	{/if}
	{@render children()}
</section>

<style>
	.phase {
		display: flex;
		flex-direction: column;
	}

	.phase-title {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 0 6px;
		font-family: 'Cinzel', serif;
		font-size: 14px;
		font-weight: 600;
		color: var(--ink);
	}

	.phase-step {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: rgba(31, 111, 115, 0.85);
		color: #fff;
		font-size: 12px;
	}

	.phase-intro {
		margin: 0 0 10px;
		font-size: 13px;
		line-height: 1.45;
		color: var(--muted-ink);
	}
</style>
