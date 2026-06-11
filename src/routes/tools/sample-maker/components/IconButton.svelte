<!--
@component
A bare icon-only button for header actions that have no keyboard chord (Reroll, Open picker). For
actions that DO own a shortcut, use {@link ShortcutButton} with its `icon` prop instead, so the
chord stays registered.
-->
<script lang="ts">
	import type { ComponentType } from 'svelte';

	interface Props {
		/** Accessible label, shown as the tooltip too. */
		label: string;
		icon: ComponentType;
		onclick: () => void;
		disabled?: boolean;
	}

	let { label, icon: Icon, onclick, disabled = false }: Props = $props();
</script>

<button type="button" class="icon-button" {disabled} aria-label={label} title={label} {onclick}>
	<Icon size={20} />
</button>

<style>
	.icon-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 8px;
		line-height: 0;
	}
</style>
