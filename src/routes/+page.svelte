<script lang="ts">
	import ShapeDragOverlay from '$lib/components/simulator/ShapeDragOverlay.svelte';
	import SimulatorStage from '$lib/components/simulator/SimulatorStage.svelte';
	import { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';
	import { onMount } from 'svelte';

	const simulator = new SimulatorSession();

	onMount(() => simulator.mount());
</script>

<svelte:head>
	<title>Witch Hat Atelier Spell Simulator</title>
</svelte:head>

<SimulatorStage {simulator} />

{#if simulator.shapeDrag.dragPreview}
	<ShapeDragOverlay preview={simulator.shapeDrag.dragPreview} />
{/if}
