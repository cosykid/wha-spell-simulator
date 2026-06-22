<!--
@component
Left-edge drawing tools: the pen (freehand draw) and the eraser, each shown with
a diamond state pip. Mutually exclusive with the transform tools.
-->
<script lang="ts">
	import Eraser from 'lucide-svelte/icons/eraser';
	import PenTool from 'lucide-svelte/icons/pen-tool';
	import ToolButton from './ToolButton.svelte';
	import type { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';

	interface Props {
		simulator: SimulatorSession;
	}

	let { simulator }: Props = $props();
	let ui = $derived(simulator.ui);
</script>

<div class="tool-dock" aria-label="Drawing tools">
	<ToolButton label="Pen" active={ui.canvasMode === 'draw'} onclick={simulator.handleSelectDraw}>
		<PenTool aria-hidden="true" />
	</ToolButton>
	<ToolButton
		id="eraserToggle"
		testId="eraser-toggle"
		label="Eraser"
		active={ui.activeTool === 'erase'}
		onclick={simulator.handleToggleEraser}
	>
		<Eraser aria-hidden="true" />
	</ToolButton>
</div>

<style>
	.tool-dock {
		display: flex;
		flex-direction: column;
		gap: 4px;
		align-items: flex-start;
	}
</style>
