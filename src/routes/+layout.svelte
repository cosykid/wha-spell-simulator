<script lang="ts">
	import '$lib/styles/styles.css';
	import { isApplePlatform, setPlatformContext } from '$lib/ui/keybindings.js';
	import { onMount, type Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	// Display ⌘ on macOS, Ctrl elsewhere. Detected after mount so the prerendered
	// markup (which always renders "Ctrl") hydrates without a mismatch. Shared via
	// context so shortcut labels are formatted once here, not in each component.
	let isMac = $state(false);
	onMount(() => {
		isMac = isApplePlatform();
	});
	setPlatformContext({
		get isMac() {
			return isMac;
		}
	});
</script>

<div class="app-background" aria-hidden="true"></div>
<div class="app-content">
	{@render children()}
</div>
