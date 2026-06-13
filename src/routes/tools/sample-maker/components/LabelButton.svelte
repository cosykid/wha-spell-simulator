<script lang="ts">
	import ShortcutButton from '$lib/ui/ShortcutButton.svelte';
	import { getMakerSession } from '../maker-session.svelte.js';

	const session = getMakerSession();
</script>

<ShortcutButton
	description="Label"
	shortcut="Ctrl+D"
	disabled={!session.picker.current || !session.hasStrokes}
	action={() => session.label()}
/>
