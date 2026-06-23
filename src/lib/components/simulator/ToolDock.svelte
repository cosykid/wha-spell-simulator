<!--
@component
Left-edge tool dock: the four mutually exclusive canvas tools, stacked as one
group. Pen and eraser draw and rub out strokes; arrange selects and moves placed
shapes; pan slides the canvas. Only one is ever active at a time (they share the
single `canvasMode`), shown by each button's filled diamond pip.

Each tool has a single-key shortcut (P, E, V, H) wired in keyboard.ts and shown
in its hover label.
-->
<script lang="ts">
	import Eraser from 'lucide-svelte/icons/eraser';
	import Frame from 'lucide-svelte/icons/frame';
	import Hand from 'lucide-svelte/icons/hand';
	import PenTool from 'lucide-svelte/icons/pen-tool';
	import ToolButton from './ToolButton.svelte';
	import type { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';

	interface Props {
		simulator: SimulatorSession;
	}

	let { simulator }: Props = $props();
	let ui = $derived(simulator.ui);
</script>

<div class="tool-dock" aria-label="Canvas tools">
	<ToolButton
		label="Pen"
		shortcut="P"
		active={ui.canvasMode === 'draw'}
		onclick={simulator.handleSelectDraw}
	>
		<PenTool aria-hidden="true" />
	</ToolButton>
	<ToolButton
		id="eraserToggle"
		testId="eraser-toggle"
		label="Eraser"
		shortcut="E"
		active={ui.activeTool === 'erase'}
		onclick={simulator.handleToggleEraser}
	>
		<Eraser aria-hidden="true" />
	</ToolButton>
	<ToolButton
		id="arrangeToggle"
		testId="arrange-toggle"
		label="Arrange shapes"
		shortcut="V"
		active={ui.activeTool === 'arrange'}
		onclick={simulator.handleToggleArrange}
	>
		<Frame aria-hidden="true" />
	</ToolButton>
	<ToolButton
		id="panToggle"
		label="Pan"
		shortcut="H"
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
		align-items: flex-start;
	}
</style>
