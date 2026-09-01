<!--
@component
Chooses which engine performs a cast: the modern cell stage, or the classic
Canvas2D effects the app shipped before the animation redesign. It is a mode,
not a stepper: it stays on until it is turned off, so it wears the mode's ink
underline rather than a pressed look of its own.

The choice is persisted with the other view preferences and honoured by the
library's replay too, so a caster who picked a style keeps it everywhere.
-->
<script lang="ts">
	import Wand from 'lucide-svelte/icons/wand';
	import ChromeButton from './ChromeButton.svelte';
	import { EFFECT_STYLE_LABELS } from '$lib/structures/effectStyle.js';
	import type { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';

	interface Props {
		simulator: SimulatorSession;
	}

	let { simulator }: Props = $props();
	let ui = $derived(simulator.ui);
	let isClassic = $derived(ui.effectStyle === 'classic');
</script>

<ChromeButton
	role="mode"
	id="effectStyleToggle"
	testId="effect-style-toggle"
	label={EFFECT_STYLE_LABELS.classic}
	icon={Wand}
	active={isClassic}
	onclick={() => ui.setEffectStyle(isClassic ? 'stage' : 'classic')}
/>
