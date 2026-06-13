<!--
@component
A {@link ButtonWithShortcut} that also registers its chord with the ambient {@link ShortcutRegistry}
so the action fires both on click and on the keyboard shortcut — without the page maintaining a
central shortcut list. Registration is torn down automatically when the button unmounts.
-->
<script lang="ts">
	import type { ComponentType } from 'svelte';
	import ButtonWithShortcut from './ButtonWithShortcut.svelte';
	import type { Shortcut } from './keybindings.js';
	import { getShortcutRegistry } from './shortcutRegistry.svelte.js';

	interface Props {
		description: string;
		/** Raw "Ctrl+…" chord label; rendered as ⌘ on macOS via the platform context. */
		shortcut: Shortcut;
		disabled?: boolean;
		action: () => void;
		type?: 'button' | 'submit';
		/** Optional icon component — renders the button icon-only (see {@link ButtonWithShortcut}). */
		icon?: ComponentType;
	}

	let { description, shortcut, disabled = false, action, type = 'button', icon }: Props = $props();

	const registry = getShortcutRegistry();

	$effect(() => registry.register({ shortcut, description, disabled: () => disabled, action }));
</script>

<ButtonWithShortcut {description} {shortcut} {disabled} {type} {icon} onclick={action} />
