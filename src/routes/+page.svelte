<script lang="ts">
	import ControlPanel from '$lib/components/ControlPanel.svelte';
	import Header from '$lib/components/Header.svelte';
	import ShapeDragOverlay from '$lib/components/simulator/ShapeDragOverlay.svelte';
	import SimulatorCanvasPanel from '$lib/components/simulator/SimulatorCanvasPanel.svelte';
	import SimulatorFooter from '$lib/components/simulator/SimulatorFooter.svelte';
	import SimulatorSidebar from '$lib/components/simulator/SimulatorSidebar.svelte';
	import { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';
	import { onMount } from 'svelte';

	const simulator = new SimulatorSession();

	onMount(() => simulator.mount());
</script>

<svelte:head>
	<title>Witch Hat Atelier Spell Simulator</title>
</svelte:head>

<div class="app-shell simulator-shell">
	<Header title="Glyph Compiler" eyebrow="Witch Hat Atelier Spell Simulator" />

	<main
		class="workspace"
		class:canvas-height-matched={simulator.ui.canvasHeightMatched}
		bind:this={simulator.ui.workspace}
	>
		<ControlPanel {simulator} />

		<SimulatorCanvasPanel {simulator} />

		<SimulatorSidebar {simulator} />
	</main>

	{#if simulator.shapeDrag.dragPreview}
		<ShapeDragOverlay preview={simulator.shapeDrag.dragPreview} />
	{/if}

	<SimulatorFooter />
</div>
