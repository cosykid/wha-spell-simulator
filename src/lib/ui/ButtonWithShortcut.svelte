<script lang="ts">
	import { formatShortcut, getPlatform, type Shortcut } from '$lib/ui/keybindings.js';
	import type { ComponentType } from 'svelte';

	interface Props {
		description: string;
		/** Raw "Ctrl+…" chord label; rendered as ⌘ on macOS via the platform context. */
		shortcut: Shortcut;
		disabled?: boolean;
		onclick?: () => void;
		type?: 'button' | 'submit';
		/**
		 * Optional lucide (or any) icon component. When set the button renders icon-only on
		 * mobile (the `description` becomes the accessible label and the shortcut moves into the
		 * `title` tooltip) and expands to the full text + shortcut button on desktop.
		 */
		icon?: ComponentType;
	}

	let { description, shortcut, disabled = false, onclick, type = 'button', icon }: Props = $props();

	const platform = getPlatform();
	const label = $derived(formatShortcut(shortcut, platform.isMac));
	const Icon = $derived(icon);
</script>

{#if Icon}
	<button
		{type}
		{disabled}
		{onclick}
		class="icon-button"
		aria-label={description}
		title="{description} ({label})"
	>
		<Icon size={20} />
		<span class="full-label">{description} <kbd>{label}</kbd></span>
	</button>
{:else}
	<button {type} {disabled} {onclick}>
		{description} <kbd>{label}</kbd>
	</button>
{/if}

<style>
	kbd {
		display: inline-block;
		padding: 1px 5px;
		font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
		font-size: 10px;
		background: rgba(36, 27, 22, 0.07);
		border: 1px solid rgba(36, 27, 22, 0.18);
		border-radius: 3px;
		pointer-events: none;
	}

	.icon-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 8px;
		line-height: 0;
	}

	.full-label {
		display: none;
		line-height: normal;
	}

	@media (min-width: 900px) {
		.full-label {
			display: inline;
		}
	}
</style>
