<script lang="ts">
	import ShortcutButton from '$lib/ui/ShortcutButton.svelte';
	import { Redo2 } from 'lucide-svelte';
	import { getMakerSession } from '../maker-session.svelte.js';

	const { scene } = getMakerSession();
</script>

<ShortcutButton
	description="Redo"
	shortcut="Ctrl+Y"
	icon={Redo2}
	disabled={!scene.canRedo()}
	action={() => scene.redo()}
/>
