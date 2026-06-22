<!--
@component
Top-left canvas history actions: undo, redo, and clear. Rendered as faint ghost
buttons that float on the parchment. Hidden once a spell seals (nothing to undo).
-->
<script lang="ts">
	import Redo2 from 'lucide-svelte/icons/redo-2';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import Undo2 from 'lucide-svelte/icons/undo-2';
	import CanvasIconButton from './CanvasIconButton.svelte';
	import type { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';

	interface Props {
		simulator: SimulatorSession;
	}

	let { simulator }: Props = $props();
	let actions = $derived(simulator.actions);
	let summary = $derived(simulator.recognition.summary);
</script>

<div class="action-bar" aria-label="Canvas actions">
	<CanvasIconButton
		id="undoButton"
		testId="undo-button"
		label="Undo"
		labelPlacement="below"
		disabled={summary.undoDisabled}
		onclick={actions.undo}
	>
		<Undo2 aria-hidden="true" />
	</CanvasIconButton>
	<CanvasIconButton
		id="redoButton"
		testId="redo-button"
		label="Redo"
		labelPlacement="below"
		disabled={summary.redoDisabled}
		onclick={actions.redo}
	>
		<Redo2 aria-hidden="true" />
	</CanvasIconButton>
	<CanvasIconButton
		id="clearButton"
		testId="clear-button"
		label="Clear"
		labelPlacement="below"
		onclick={actions.clear}
	>
		<Trash2 aria-hidden="true" />
	</CanvasIconButton>
</div>

<style>
	.action-bar {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.action-bar :global(button) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 33px;
		height: 33px;
		min-height: 33px;
		padding: 0;
		border: 1px solid var(--chrome-btn-border);
		border-radius: 9px;
		color: var(--chrome-btn-fg);
		background: var(--chrome-btn-bg);
		box-shadow: none;
		transition:
			color 160ms ease,
			background 160ms ease,
			border-color 160ms ease;
	}

	.action-bar :global(button:hover:not(:disabled)) {
		background: var(--chrome-btn-bg-hover);
	}

	.action-bar :global(button:disabled) {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.action-bar :global(svg) {
		width: 16px;
		height: 16px;
		display: block;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.9;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
