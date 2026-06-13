<!--
@component
The slide-up sign picker: a bottom sheet listing every sign (via the shared {@link Labels} grid).
Picking previews the sign (never stamps it — that happens on "Label") and closes the sheet. Shown
while `session.pickerOpen`; dismissed by the backdrop, the close button, or Escape.
-->
<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import Labels from '../Labels.svelte';
	import { getMakerSession } from '../maker-session.svelte.js';
	import { SAMPLE_SYMBOLS, type SampleSymbol } from '../symbols.js';

	const session = getMakerSession();

	function pick(symbol: SampleSymbol): void {
		session.suggest(symbol);
		session.pickerOpen = false;
	}

	function onKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape' && session.pickerOpen) session.pickerOpen = false;
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if session.pickerOpen}
	<button
		type="button"
		class="sheet-backdrop"
		aria-label="Close picker"
		transition:fade={{ duration: 150 }}
		onclick={() => (session.pickerOpen = false)}
	></button>
	<div
		class="sheet"
		role="dialog"
		aria-label="Choose a sign"
		transition:fly={{ y: 400, duration: 250 }}
	>
		<div class="sheet-grip"></div>
		<h2 class="sheet-title">Choose a sign</h2>
		<div class="sheet-scroll">
			<Labels
				symbols={SAMPLE_SYMBOLS}
				selectedId={session.picker.current?.id ?? null}
				onpick={pick}
			/>
		</div>
	</div>
{/if}

<style>
	.sheet-backdrop {
		position: fixed;
		inset: 0;
		z-index: 20;
		border: none;
		padding: 0;
		background: rgba(36, 27, 22, 0.5);
		cursor: pointer;
	}

	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 21;
		display: flex;
		flex-direction: column;
		max-height: 70vh;
		padding: 8px 16px 20px;
		border-radius: 16px 16px 0 0;
		background: var(--paper, #f2eccd);
		box-shadow: 0 -18px 45px rgba(36, 27, 22, 0.4);
	}

	.sheet-grip {
		flex: 0 0 auto;
		align-self: center;
		width: 40px;
		height: 4px;
		margin: 4px 0 10px;
		border-radius: 2px;
		background: rgba(36, 27, 22, 0.25);
	}

	.sheet-title {
		margin: 0 0 12px;
		font-family: 'Cinzel', serif;
		font-size: 16px;
		font-weight: 600;
		color: var(--ink);
	}

	.sheet-scroll {
		overflow-y: auto;
		min-height: 0;
	}

	/* Center the sheet and cap its width on larger screens. */
	@media (min-width: 700px) {
		.sheet {
			left: 50%;
			right: auto;
			width: min(620px, 92vw);
			transform: translateX(-50%);
		}
	}
</style>
