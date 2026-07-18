<!--
@component
Right-edge trigger rail for the reference drawer. Each tab opens the drawer to its
panel (or toggles it shut). These buttons are the only place the panel names live,
so there is exactly one "Shapes" button (the E2E entry point).
-->
<script lang="ts">
	import BarChart3 from 'lucide-svelte/icons/bar-chart-3';
	import BookMarked from 'lucide-svelte/icons/book-marked';
	import BookOpen from 'lucide-svelte/icons/book-open';
	import Shapes from 'lucide-svelte/icons/shapes';
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
		{@const active = ui.referenceOpen && ui.rootTab === tab.id}
		<button
			type="button"
			class="ref-tab"
			class:active
			aria-pressed={active}
			onclick={() => ui.openReference(tab.id)}
		>
			<tab.icon aria-hidden="true" />
			<span>{tab.label}</span>
		</button>
	{/each}
</div>

<style>
	.ref-tabs {
		display: flex;
		flex-direction: column;
		gap: 6px;
		align-items: flex-end;
	}

	.ref-tab {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 36px;
		padding: 0 12px;
		border: 1px solid transparent;
		border-radius: var(--chrome-btn-radius);
		color: var(--ink-sepia-45);
		background: transparent;
		box-shadow: none;
		font-size: 13px;
		transition:
			color 160ms ease,
			background 160ms ease,
			border-color 160ms ease;
	}

	.ref-tab:hover {
		color: var(--ink-sepia);
		background: var(--chrome-glass);
		border-color: var(--ink-sepia-20);
	}

	.ref-tab.active {
		color: var(--ink-sepia);
		background: var(--chrome-glass-strong);
		border-color: var(--ink-sepia-20);
	}

	.ref-tab :global(svg) {
		width: 17px;
		height: 17px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.9;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	/* On phones the labels would crowd the canvas; show icons only. */
	@media (max-width: 640px) {
		.ref-tab span {
			display: none;
		}

		.ref-tab {
			width: 40px;
			height: 40px;
			padding: 0;
			justify-content: center;
		}
	}
</style>
