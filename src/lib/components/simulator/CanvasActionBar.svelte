<!--
@component
Top-left canvas history actions: undo, redo, clear, and saving the drawing as a
spell preset. Rendered as faint ghost buttons that float on the parchment.
-->
<script lang="ts">
	import BookmarkPlus from 'lucide-svelte/icons/bookmark-plus';
	import { toast } from '@zerodevx/svelte-toast';
	import CanvasIconButton from './CanvasIconButton.svelte';
	import ArcaneBroom from './icons/ArcaneBroom.svelte';
	import ArcaneRedo from './icons/ArcaneRedo.svelte';
	import ArcaneUndo from './icons/ArcaneUndo.svelte';
	import { getAuthState } from '$lib/ui/auth/auth-state.svelte.js';
	import type { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';

	interface Props {
		simulator: SimulatorSession;
	}

	let { simulator }: Props = $props();
	const auth = getAuthState();
	let actions = $derived(simulator.actions);
	let summary = $derived(simulator.recognition.summary);

	function saveSpell() {
		const { drawing } = simulator;
		if (drawing.store.count() + drawing.placements.count() === 0) {
			toast.push('Draw a spell before inscribing it.');
			return;
		}
		auth.requireUser(() => (simulator.grimoire.saveDialogOpen = true));
	}
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
	<CanvasIconButton
		id="saveSpellButton"
		testId="save-spell-button"
		label="Save spell"
		labelPlacement="below"
		onclick={saveSpell}
	>
		<BookmarkPlus aria-hidden="true" />
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
