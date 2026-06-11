<script lang="ts">
	import ShortcutButton from '$lib/ui/ShortcutButton.svelte';
	import { Undo2 } from 'lucide-svelte';
	import { getMakerSession } from '../maker-session.svelte.js';

	const { scene } = getMakerSession();
</script>

<ShortcutButton
	description="Undo"
	shortcut="Ctrl+Z"
	icon={Undo2}
	disabled={!scene.canUndo()}
	action={() => scene.undo()}
/>
