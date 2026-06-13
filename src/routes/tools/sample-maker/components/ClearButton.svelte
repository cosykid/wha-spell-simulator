<script lang="ts">
	import ShortcutButton from '$lib/ui/ShortcutButton.svelte';
	import { Trash2 } from 'lucide-svelte';
	import { getMakerSession } from '../maker-session.svelte.js';

	const session = getMakerSession();
</script>

<ShortcutButton
	description="Clear"
	shortcut="Ctrl+L"
	icon={Trash2}
	disabled={!session.hasStrokes && !session.selected}
	action={() => session.clear()}
/>
