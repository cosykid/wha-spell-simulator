<!--
@component
Chooses which engine performs a cast: the modern cell stage, or the classic
Canvas2D effects the app shipped before the animation redesign. One button,
pressed while classic is on, sat with the other canvas controls because it is a
display choice like zoom rather than a drawing tool.

The choice is persisted with the other view preferences and honoured by the
library's replay too, so a caster who picked a style keeps it everywhere.
-->
<script lang="ts">
	import CanvasIconButton from './CanvasIconButton.svelte';
	import ArcaneSparks from './icons/ArcaneSparks.svelte';
	import { EFFECT_STYLE_LABELS } from '$lib/structures/effectStyle.js';
	import type { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';

	interface Props {
		simulator: SimulatorSession;
	}

	let { simulator }: Props = $props();
	let ui = $derived(simulator.ui);
	let isClassic = $derived(ui.effectStyle === 'classic');
	let tooltip = $derived(
		isClassic ? EFFECT_STYLE_LABELS.classic : `Switch to ${EFFECT_STYLE_LABELS.classic}`
	);
</script>

<div class="effect-style-toggle">
	<CanvasIconButton
		id="effectStyleToggle"
		testId="effect-style-toggle"
		buttonClass="zoom-btn"
		label={EFFECT_STYLE_LABELS.classic}
		{tooltip}
		pressed={isClassic}
		onclick={() => ui.setEffectStyle(isClassic ? 'stage' : 'classic')}
	>
		<ArcaneSparks aria-hidden="true" />
	</CanvasIconButton>
</div>

<style>
	.effect-style-toggle {
		display: flex;
	}

	/* The shared plate has no pressed look of its own, and this control has to
	   read as on or off at a glance. Reaches across the primitive's scope
	   boundary, which is why it is :global under this wrapper. */
	.effect-style-toggle :global(button[aria-pressed='true']) {
		color: var(--gold);
		border-color: var(--gold);
	}
</style>
