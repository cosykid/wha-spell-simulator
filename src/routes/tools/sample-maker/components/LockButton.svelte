<!--
@component
Toggles whether the current sign stays locked when advancing to the next sample after a submit.
When locked the same sign is re-suggested (with a fresh random rotation) instead of the
weighted-pick advancing to a different one. State is session-only — not persisted.
-->
<script lang="ts">
	import { Lock, LockOpen } from 'lucide-svelte';
	import { getMakerSession } from '../maker-session.svelte.js';
	import IconButton from './IconButton.svelte';

	const session = getMakerSession();
</script>

<IconButton
	label={session.locked
		? 'Unlock sign (advance to a new sign after submit)'
		: 'Lock sign (keep drawing this sign after submit)'}
	icon={session.locked ? Lock : LockOpen}
	active={session.locked}
	disabled={!session.picker.current}
	onclick={() => session.toggleLock()}
/>
