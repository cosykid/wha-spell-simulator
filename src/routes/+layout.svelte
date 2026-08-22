<script lang="ts">
	import '$lib/styles/tokens.css';
	import '$lib/styles/base.css';
	import '$lib/styles/layout.css';
	import '$lib/styles/canvas.css';
	import '$lib/styles/reference-cards.css';
	import '$lib/styles/tabs.css';
	import '$lib/styles/content.css';
	import AuthDialog from '$lib/components/auth/AuthDialog.svelte';
	import { portalCssVariables } from '$lib/portal/portal.js';
	import { AuthState, setAuthState } from '$lib/ui/auth/auth-state.svelte.js';
	import { isApplePlatform, setPlatformContext } from '$lib/ui/keybindings.js';
	import { dev } from '$app/environment';
	import { injectAnalytics } from '@vercel/analytics/sveltekit';
	import { SvelteToast } from '@zerodevx/svelte-toast';
	import { onMount, type Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	// Vercel Web Analytics. No-ops during SSR/prerender and reports page views
	// client-side on every navigation. In dev it only logs to the console.
	injectAnalytics({ mode: dev ? 'development' : 'production' });

	// One auth state for the whole app, hydrated from the session cookie after
	// mount so the prerendered markup stays identical for guests and users.
	const auth = setAuthState(new AuthState());
	onMount(() => {
		void auth.refresh();
	});

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
<!-- The portal tilt's numbers are handed to CSS here, once, from the module that
     also projects the spell effect onto that tilt. See portal/portal.ts. -->
<div class="app-content" style={portalCssVariables()}>
	{@render children()}
</div>

<!-- Global toast host: fixed-positioned, so it stays visible above any panel overflow. -->
<SvelteToast options={{ duration: 4000, pausable: true }} />

<!-- Shared sign-in modal, opened from anywhere via the auth context. -->
<AuthDialog />

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
