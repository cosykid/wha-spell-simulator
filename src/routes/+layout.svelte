<script lang="ts">
	import '$lib/styles/tokens.css';
	import '$lib/styles/base.css';
	import '$lib/styles/layout.css';
	import '$lib/styles/canvas.css';
	import '$lib/styles/reference-cards.css';
	import '$lib/styles/tabs.css';
	import '$lib/styles/content.css';
	import { isApplePlatform, setPlatformContext } from '$lib/ui/keybindings.js';
	import { SvelteToast } from '@zerodevx/svelte-toast';
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

<!-- Global toast host: fixed-positioned, so it stays visible above any panel overflow. -->
<SvelteToast options={{ duration: 4000, pausable: true }} />

<style>
	.app-background {
		position: fixed;
		inset: 0;
		z-index: 0;
		pointer-events: none;
		background:
			linear-gradient(rgba(17, 40, 46, 0.34), rgba(15, 33, 39, 0.5)),
			url('/images/app-background.webp') center / cover no-repeat;
		opacity: 0.82;
	}

	.app-content {
		position: relative;
		z-index: 1;
		min-height: 100vh;
	}

	@media (prefers-reduced-data: reduce) {
		.app-background {
			background: linear-gradient(rgba(17, 40, 46, 0.94), rgba(13, 30, 36, 0.92));
		}
	}
</style>
