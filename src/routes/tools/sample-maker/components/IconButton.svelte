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
		/** When true, renders the button with a teal accent to indicate an engaged/on state. */
		active?: boolean;
	}

	let { label, icon: Icon, onclick, disabled = false, active = false }: Props = $props();
</script>

<button
	type="button"
	class="icon-button"
	class:active
	{disabled}
	aria-label={label}
	aria-pressed={active}
	title={label}
	{onclick}
>
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

	.icon-button.active {
		background: rgba(31, 111, 115, 0.14);
		color: rgba(31, 111, 115, 0.9);
		border-radius: 6px;
	}
</style>
