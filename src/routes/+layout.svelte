<script lang="ts">
	import '$lib/styles/styles.css';
	import { gachaStore } from '$lib/gachaStore.svelte.js';
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
		// Load gacha profile (currency, cosmetics, active ink/effect) once for the
		// whole app so the simulator's ink rewards and equipped cosmetics are
		// available without visiting the gacha page first.
		void gachaStore.load();
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
