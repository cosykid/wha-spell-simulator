<!--
@component
The first-spell guide's chrome: the welcome card a newcomer lands on, the walk
captions that follow the ghost ink on the paper, and the celebration when the
sealed spell finishes playing. All state and step logic live on
`simulator.firstSpell`; this component only shows it.
-->
<script lang="ts">
	import { lightDismiss } from '$lib/ui/lightDismiss.js';
	import { FIRST_SPELL_CAPTIONS } from '$lib/ui/simulator/first-spell-script.js';
	import type { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';

	interface Props {
		simulator: SimulatorSession;
	}

	let { simulator }: Props = $props();
	let guide = $derived(simulator.firstSpell);
	let caption = $derived(FIRST_SPELL_CAPTIONS[guide.step]);
	let dialogOpen = $derived(guide.phase === 'welcome' || guide.phase === 'done');
	let beginTearsPage = $derived(simulator.recognition.summary.canvasLocked);

	let dialog = $state<HTMLDialogElement>();

	$effect(() => {
		if (!dialog) return;
		if (dialogOpen && !dialog.open) {
			dialog.showModal();
		} else if (!dialogOpen && dialog.open) {
			dialog.close();
		}
	});

	// Escape and the backdrop close the dialog natively; route that to the phase
	// it was showing. A programmatic close (begin was clicked, phase is already
	// 'walk') must not overwrite the new phase, so each branch checks it.
	function handleClose() {
		if (guide.phase === 'welcome') {
			guide.skip();
		} else if (guide.phase === 'done') {
			guide.finish();
		}
	}

	function openDictionary() {
		simulator.ui.openReference('dictionary');
		guide.finish();
	}
</script>

<dialog
	bind:this={dialog}
	class="guide-dialog"
	data-testid="first-spell-dialog"
	aria-labelledby="firstSpellTitle"
	{@attach lightDismiss()}
	onclose={handleClose}
>
	{#if guide.phase === 'done'}
		<p class="guide-eyebrow">First spell</p>
		<h2 id="firstSpellTitle">Your first spell is cast</h2>
		<p class="guide-lead">You drew the ring, named the fire, and sealed it awake.</p>
		<p class="guide-lead">
			The Dictionary holds more sigils and signs to combine. The Shapes palette stamps any symbol
			that fights your pen. Save spell keeps what you make.
		</p>
		<div class="guide-actions">
			<button
				type="button"
				class="guide-quiet"
				data-testid="guide-dictionary-button"
				onclick={openDictionary}
			>
				Open the Dictionary
			</button>
			<button
				type="button"
				class="guide-primary"
				data-testid="guide-finish-button"
				onclick={guide.finish}
			>
				Finish
			</button>
		</div>
	{:else}
		<p class="guide-eyebrow">First spell</p>
		<h2 id="firstSpellTitle">Draw your first spell</h2>
		<p class="guide-lead">
			Spells here are drawn by hand: a ring to hold the magic, a sigil to name it, a seal to wake
			it. A golden guide will trace each mark on the paper. Draw over it, and the cast at the end is
			yours.
		</p>
		{#if beginTearsPage}
			<p class="guide-fresh-note">Beginning starts a fresh page. Undo brings this one back.</p>
		{/if}
		<div class="guide-actions">
			<button
				type="button"
				class="guide-quiet"
				data-testid="guide-dismiss-button"
				onclick={guide.skip}
			>
				Explore on my own
			</button>
			<button
				type="button"
				class="guide-primary"
				data-testid="guide-begin-button"
				onclick={guide.begin}
			>
				Begin
			</button>
		</div>
	{/if}
</dialog>

{#if guide.active}
	<div
		class="guide-caption"
		data-testid="first-spell-caption"
		data-guide-step={guide.step}
		aria-live="polite"
	>
		<p class="guide-eyebrow">{caption.ordinal}</p>
		<p class="guide-title">{caption.title}</p>
		<p class="guide-body">{caption.body}</p>
		{#if guide.coaching}
			<p class="guide-coach" data-testid="guide-coaching">{guide.coaching}</p>
		{/if}
		<div class="guide-controls">
			{#if guide.practiceOffered}
				<button
					type="button"
					class="guide-link"
					data-testid="guide-practice-button"
					onclick={guide.placePractice}
				>
					Trouble? Let the guide draw it
				</button>
			{/if}
			<button type="button" class="guide-link" data-testid="guide-skip-button" onclick={guide.skip}>
				End guide
			</button>
		</div>
	</div>
{/if}

<style>
	/* The same rise the save dialog makes, so the guide walks in on house easing. */
	.guide-dialog {
		width: min(400px, 92vw);
		padding: 24px;
		border: 1px solid var(--panel-line);
		border-radius: 12px;
		color: var(--ink);
		background: var(--panel, #f2ecd6);
		box-shadow: 0 24px 60px rgba(36, 27, 22, 0.45);
		opacity: 1;
		scale: 1;
		transition:
			opacity 220ms ease,
			scale 220ms cubic-bezier(0.22, 1, 0.36, 1),
			overlay 220ms allow-discrete,
			display 220ms allow-discrete;
	}

	.guide-dialog:not([open]) {
		opacity: 0;
		scale: 0.97;
	}

	@starting-style {
		.guide-dialog[open] {
			opacity: 0;
			scale: 0.97;
		}
	}

	.guide-dialog::backdrop {
		background: rgba(36, 27, 22, 0.5);
		transition:
			background 220ms ease,
			overlay 220ms allow-discrete,
			display 220ms allow-discrete;
	}

	.guide-dialog:not([open])::backdrop {
		background: rgba(36, 27, 22, 0);
	}

	@starting-style {
		.guide-dialog[open]::backdrop {
			background: rgba(36, 27, 22, 0);
		}
	}

	.guide-eyebrow {
		margin: 0 0 6px;
		font-family: 'Cinzel', serif;
		color: var(--gold);
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.guide-dialog h2 {
		margin: 0 0 12px;
		font-family: 'Cinzel', serif;
		font-size: 1.25rem;
		letter-spacing: 0.04em;
	}

	.guide-lead {
		margin: 0 0 10px;
		font-size: 0.95rem;
		line-height: 1.5;
	}

	.guide-fresh-note {
		margin: 0 0 10px;
		font-size: 0.85rem;
		font-style: italic;
		color: var(--muted-ink);
	}

	.guide-actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		margin-top: 14px;
	}

	.guide-primary {
		padding: 8px 22px;
		border: 1px solid var(--ink-sepia);
		border-radius: var(--radius);
		background: var(--ink-sepia);
		color: var(--panel);
		font-size: 15px;
	}

	.guide-primary:hover {
		background: var(--warm-wood-deep);
		border-color: var(--warm-wood-deep);
	}

	.guide-quiet {
		padding: 8px 14px;
		border: 1px solid transparent;
		border-radius: var(--radius);
		background: none;
		box-shadow: none;
		color: var(--ink-sepia-70);
		font-size: 14px;
	}

	.guide-quiet:hover {
		color: var(--ink-sepia);
		background: var(--chrome-glass);
	}

	/* Sits in the hint's slot at the top of the paper: same width rule, but as a
	   card, since it speaks for a whole walk rather than one passing line. The
	   wrapper stays transparent to pointer input so the parchment underneath is
	   drawable; only the buttons take the pointer. */
	.guide-caption {
		position: absolute;
		top: calc(var(--chrome-inset-y) + 8px);
		left: 50%;
		transform: translateX(-50%);
		z-index: 4;
		width: min(
			420px,
			calc(100vw - 2 * (var(--chrome-inset-x) + var(--chrome-control-width) + 12px))
		);
		padding: 10px 18px 8px;
		border: 1px solid var(--ink-sepia-20);
		border-radius: 10px;
		background: var(--drawer-glass);
		backdrop-filter: blur(var(--drawer-blur)) saturate(1.1);
		text-align: center;
		pointer-events: none;
	}

	.guide-caption button {
		pointer-events: auto;
	}

	.guide-caption .guide-eyebrow {
		margin: 0 0 2px;
		font-size: 11px;
	}

	.guide-title {
		margin: 0 0 4px;
		font-family: 'Cinzel', serif;
		font-size: 16px;
		font-weight: 600;
		color: var(--ink-sepia);
	}

	.guide-body {
		margin: 0;
		font-size: 13.5px;
		line-height: 1.45;
		color: var(--ink-sepia-70);
	}

	.guide-coach {
		margin: 6px 0 0;
		font-size: 13px;
		line-height: 1.4;
		color: var(--ember);
	}

	.guide-controls {
		display: flex;
		justify-content: center;
		gap: 16px;
		margin-top: 6px;
	}

	.guide-link {
		min-height: 0;
		padding: 2px 1px;
		border: 0;
		border-bottom: 1px solid var(--ink-sepia-20);
		border-radius: 0;
		background: none;
		box-shadow: none;
		font-size: 12.5px;
		font-style: italic;
		color: var(--ink-sepia-70);
	}

	.guide-link:hover {
		background: none;
		border-bottom-color: var(--gold);
		color: var(--ink-sepia);
	}

	.guide-link:focus-visible,
	.guide-primary:focus-visible,
	.guide-quiet:focus-visible {
		outline: var(--focus-ring);
		outline-offset: var(--focus-ring-offset);
	}

	/* The phone layout drops the hint below the Menu row; the caption follows. */
	@media (max-width: 640px) {
		.guide-caption {
			top: var(--chrome-band-y);
		}

		.guide-body {
			font-size: 12px;
		}
	}
</style>
