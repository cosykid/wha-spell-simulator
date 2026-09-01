<!--
@component
The four mutually exclusive canvas tools, stacked as one group at the head of
the left column. Pen and eraser draw and rub out strokes; arrange selects and
moves placed shapes; pan slides the canvas. Only one is ever active at a time
(they share the single `canvasMode`), shown by each button's ink underline.

Each tool has a single-key shortcut (P, E, V, H) wired in keyboard.ts and shown
in its hover label.
-->
<script lang="ts">
	import Eraser from 'lucide-svelte/icons/eraser';
	import Frame from 'lucide-svelte/icons/frame';
	import Hand from 'lucide-svelte/icons/hand';
	import PenTool from 'lucide-svelte/icons/pen-tool';
	import ChromeButton from './ChromeButton.svelte';
	import type { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';

	interface Props {
		simulator: SimulatorSession;
	}

	let { simulator }: Props = $props();
	let ui = $derived(simulator.ui);
</script>

<div class="tool-dock" aria-label="Canvas tools">
	<ChromeButton
		role="mode"
		label="Pen"
		icon={PenTool}
		shortcut="P"
		chipAlign="left"
		active={ui.canvasMode === 'draw'}
		onclick={simulator.handleSelectDraw}
	/>
	<ChromeButton
		role="mode"
		id="eraserToggle"
		testId="eraser-toggle"
		label="Eraser"
		icon={Eraser}
		shortcut="E"
		chipAlign="left"
		active={ui.activeTool === 'erase'}
		onclick={simulator.handleToggleEraser}
	/>
	<ChromeButton
		role="mode"
		id="arrangeToggle"
		testId="arrange-toggle"
		label="Arrange shapes"
		icon={Frame}
		shortcut="V"
		chipAlign="left"
		active={ui.activeTool === 'arrange'}
		onclick={simulator.handleToggleArrange}
	/>
	<ChromeButton
		role="mode"
		id="panToggle"
		label="Pan"
		icon={Hand}
		shortcut="H"
		chipAlign="left"
		active={ui.panEnabled}
		onclick={simulator.handleTogglePan}
	/>
</div>

<style>
	.tool-dock {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
	}
</style>
