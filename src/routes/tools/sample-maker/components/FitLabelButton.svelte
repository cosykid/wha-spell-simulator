<script lang="ts">
	import ShortcutButton from '$lib/ui/ShortcutButton.svelte';
	import { Crosshair } from 'lucide-svelte';
	import { getMakerSession } from '../maker-session.svelte.js';

	const session = getMakerSession();
</script>

<ShortcutButton
	description="Fit label"
	shortcut="Ctrl+Enter"
	icon={Crosshair}
	disabled={!session.canFit}
	action={() => session.fitLabel()}
/>
