<script lang="ts">
	import ShapeDragOverlay from '$lib/components/simulator/ShapeDragOverlay.svelte';
	import SimulatorStage from '$lib/components/simulator/SimulatorStage.svelte';
	import { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';
	import { takePendingCast } from '$lib/ui/spells/castHandoff.js';
	import { toast } from '@zerodevx/svelte-toast';
	import { onMount } from 'svelte';

	const simulator = new SimulatorSession();

	onMount(() => {
		if (import.meta.env.DEV) {
			(window as unknown as Record<string, unknown>).__simulator = simulator;
		}
		return simulator.mount();
	});

	// A spell chosen in the library arrives via sessionStorage. Load it as soon
	// as the canvas is ready. takePendingCast clears the stash, so this runs once.
	$effect(() => {
		if (!simulator.ui.inputReady) {
			return;
		}
		const pending = takePendingCast();
		if (pending && simulator.actions.loadPreset(pending)) {
			toast.push('Spell copied onto your canvas. Seal the ring to cast it.');
		}
	});
</script>

<svelte:head>
	<title>Witch Hat Atelier Spell Simulator</title>
</svelte:head>

<SimulatorStage {simulator} />

{#if simulator.shapeDrag.dragPreview}
	<ShapeDragOverlay preview={simulator.shapeDrag.dragPreview} />
{/if}
