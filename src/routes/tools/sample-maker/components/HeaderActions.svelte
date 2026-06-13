<!--
@component
The header's action icons: Reroll the suggested sign, Open the picker sheet, and Clear the canvas.
Clear keeps its Ctrl+L chord (via ShortcutButton); Reroll and Open-picker are plain icon buttons.
-->
<script lang="ts">
	import { LayoutGrid, RotateCw } from 'lucide-svelte';
	import { getMakerSession } from '../maker-session.svelte.js';
	import ClearButton from './ClearButton.svelte';
	import IconButton from './IconButton.svelte';
	import LockButton from './LockButton.svelte';

	const session = getMakerSession();
</script>

<div class="header-actions">
	<IconButton label="Suggest another sign" icon={RotateCw} onclick={() => session.suggest()} />
	<IconButton
		label="Choose a sign"
		icon={LayoutGrid}
		onclick={() => (session.pickerOpen = !session.pickerOpen)}
	/>
	<LockButton />
	<ClearButton />
</div>

<style>
	.header-actions {
		display: flex;
		align-items: center;
		gap: 2px;
	}
</style>
