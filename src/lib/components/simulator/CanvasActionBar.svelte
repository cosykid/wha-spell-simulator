<!--
@component
Top-left canvas history actions: undo, redo, and clear. Rendered as faint ghost
buttons that float on the parchment. Hidden once a spell seals (nothing to undo).
-->
<script lang="ts">
	import CanvasIconButton from './CanvasIconButton.svelte';
	import ArcaneBroom from './icons/ArcaneBroom.svelte';
	import ArcaneRedo from './icons/ArcaneRedo.svelte';
	import ArcaneUndo from './icons/ArcaneUndo.svelte';
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
		<ArcaneUndo aria-hidden="true" />
	</CanvasIconButton>
	<CanvasIconButton
		id="redoButton"
		testId="redo-button"
		label="Redo"
		labelPlacement="below"
		disabled={summary.redoDisabled}
		onclick={actions.redo}
	>
		<ArcaneRedo aria-hidden="true" />
	</CanvasIconButton>
	<CanvasIconButton
		id="clearButton"
		testId="clear-button"
		label="Clear"
		labelPlacement="below"
		onclick={actions.clear}
	>
		<ArcaneBroom aria-hidden="true" />
	</CanvasIconButton>
</div>

<style>
	/* Layout only; the plate look lives in CanvasIconButton. */
	.action-bar {
		display: flex;
		align-items: center;
		gap: 6px;
	}
</style>
