<!--
@component
Right-edge trigger rail for the reference drawer. Each tab opens the drawer to
its panel (or toggles it shut). These buttons are the only place the panel names
live, so there is exactly one "Shapes" button (the E2E entry point).

They are openers, so each carries a caret pointing off-screen at the drawer it
reveals, which turns back inward once that panel is open.
-->
<script lang="ts">
	import BarChart3 from 'lucide-svelte/icons/bar-chart-3';
	import BookMarked from 'lucide-svelte/icons/book-marked';
	import BookOpen from 'lucide-svelte/icons/book-open';
	import Shapes from 'lucide-svelte/icons/shapes';
	import ChromeButton from './ChromeButton.svelte';
	import type { RootTab } from '$lib/ui/simulator/types.js';
	import type { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';

	interface Props {
		simulator: SimulatorSession;
	}

	let { simulator }: Props = $props();
	let ui = $derived(simulator.ui);

	// All lucide icons share one component signature, so one icon's type covers them.
	const tabs: { id: RootTab; label: string; icon: typeof BookOpen }[] = [
		{ id: 'dictionary', label: 'Dictionary', icon: BookOpen },
		{ id: 'shapes', label: 'Shapes', icon: Shapes },
		{ id: 'spells', label: 'My Spells', icon: BookMarked },
		{ id: 'diagnostic', label: 'Diagnostics', icon: BarChart3 }
	];
</script>

<div class="ref-tabs" aria-label="Reference panels">
	{#each tabs as tab (tab.id)}
		<ChromeButton
			role="opener"
			anchor="right"
			showLabel
			chipAlign="right"
			label={tab.label}
			icon={tab.icon}
			active={ui.referenceOpen && ui.rootTab === tab.id}
			onclick={() => ui.openReference(tab.id)}
		/>
	{/each}
</div>

<style>
	.ref-tabs {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 4px;
	}

	/* On phones the labels would crowd the canvas; show icons and caret only. */
	@media (max-width: 640px) {
		.ref-tabs :global(.btn-label) {
			display: none;
		}
	}
</style>
