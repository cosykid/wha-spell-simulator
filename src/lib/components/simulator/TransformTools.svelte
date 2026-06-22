<!--
@component
Top-right transform tools: arrange (select and move placed shapes) and pan. Pips
face inward toward the canvas. Mutually exclusive with the drawing tools.
-->
<script lang="ts">
	import Frame from 'lucide-svelte/icons/frame';
	import Hand from 'lucide-svelte/icons/hand';
	import ToolButton from './ToolButton.svelte';
	import type { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';

	interface Props {
		simulator: SimulatorSession;
	}

	let { simulator }: Props = $props();
	let ui = $derived(simulator.ui);
</script>

<div class="tool-dock" aria-label="Transform tools">
	<ToolButton
		id="arrangeToggle"
		testId="arrange-toggle"
		label="Arrange shapes"
		pipFirst
		labelBelow
		active={ui.activeTool === 'arrange'}
		onclick={simulator.handleToggleArrange}
	>
		<Frame aria-hidden="true" />
	</ToolButton>
	<ToolButton
		id="panToggle"
		label="Pan"
		pipFirst
		labelBelow
		active={ui.panEnabled}
		onclick={simulator.handleTogglePan}
	>
		<Hand aria-hidden="true" />
	</ToolButton>
</div>

<style>
	.tool-dock {
		display: flex;
		flex-direction: column;
		gap: 4px;
		align-items: flex-end;
	}
</style>
