<!--
@component
Mutes the cast. Sound is on by default and follows every cast whichever engine
performs it, so like the effect style this is a kept preference rather than
view transport: a mode that stays on until it is turned off, wearing the mode's
ink underline while the paper is silent.

Muting never stops a cast from being scheduled, only from being heard, so
unmuting mid-cast lands at once. M does the same from the keyboard.
-->
<script lang="ts">
	import VolumeX from 'lucide-svelte/icons/volume-x';
	import ChromeButton from './ChromeButton.svelte';
	import type { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';

	interface Props {
		simulator: SimulatorSession;
	}

	let { simulator }: Props = $props();
	let ui = $derived(simulator.ui);
	let muted = $derived(!ui.soundEnabled);
</script>

<ChromeButton
	role="mode"
	id="soundToggle"
	testId="sound-toggle"
	label="Mute sound"
	icon={VolumeX}
	shortcut="M"
	active={muted}
	onclick={ui.toggleSound}
/>
