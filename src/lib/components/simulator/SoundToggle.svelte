<!--
@component
Mutes the cast. Sound is on by default and follows every cast whichever engine
performs it, so like the effect style this is a kept preference rather than view
transport.

It is a toggle, not a mode: the speaker itself says which state you are in, and
the button renames itself to whichever act the next press performs. So it wears
no ink underline. Silence is not a mode left running, and a stroke beneath a
glyph that already reads as silent would only say it twice.

Muting never stops a cast from being scheduled, only from being heard, so
unmuting mid-cast lands at once. M does the same from the keyboard.
-->
<script lang="ts">
	import Volume2 from 'lucide-svelte/icons/volume-2';
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
	role="toggle"
	id="soundToggle"
	testId="sound-toggle"
	label={muted ? 'Unmute' : 'Mute'}
	icon={Volume2}
	activeIcon={VolumeX}
	shortcut="M"
	active={muted}
	onclick={ui.toggleSound}
/>
