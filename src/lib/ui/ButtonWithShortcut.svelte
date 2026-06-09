<script lang="ts">
	import { formatShortcut, getPlatform, type Shortcut } from '$lib/ui/keybindings.js';

	interface Props {
		description: string;
		/** Raw "Ctrl+…" chord label; rendered as ⌘ on macOS via the platform context. */
		shortcut: Shortcut;
		disabled?: boolean;
		onclick?: () => void;
		type?: 'button' | 'submit';
	}

	let { description, shortcut, disabled = false, onclick, type = 'button' }: Props = $props();

	const platform = getPlatform();
	const label = $derived(formatShortcut(shortcut, platform.isMac));
</script>

<button {type} {disabled} {onclick}>
	{description} <kbd>{label}</kbd>
</button>

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
</style>
