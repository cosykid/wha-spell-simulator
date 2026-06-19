<!--
@component
The Sample Maker page: a thin shell that wires up the shared contexts (the MakerSession, the
scene, and the keyboard-shortcut registry) and lays out a single full-canvas, phase-driven UI —
a header (mobile) or expanded sidebar (desktop), the canvas, a phase-relevant instruction line,
and a bottom action bar — plus the slide-up picker and full-page symbol overlays. All behaviour
lives in the small self-contained components under ./components, which reach this shared state
through context rather than props.
-->
<script lang="ts">
	import Canvas from '$canvas/Canvas.svelte';
	import { createShortcutRegistry, setShortcutRegistry } from '$lib/ui/shortcutRegistry.svelte.js';
	import type { PageData } from './$types';
	import Instructions from './components/Instructions.svelte';
	import MakerHeader from './components/MakerHeader.svelte';
	import MakerSidebar from './components/MakerSidebar.svelte';
	import PhaseBar from './components/PhaseBar.svelte';
	import SymbolOverlay from './components/SymbolOverlay.svelte';
	import SymbolPickerSheet from './components/SymbolPickerSheet.svelte';
	import { MakerSession, setMakerSession } from './maker-session.svelte.js';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const session = new MakerSession(() => data);
	setMakerSession(session);
	const registry = createShortcutRegistry();
	setShortcutRegistry(registry);

	// Seed the first suggestion once the page is on screen.
	$effect(() => {
		if (!session.picker.current) session.suggest();
	});
</script>

<svelte:window onkeydown={registry.handleKeyDown} />

<svelte:head>
	<title>Sample Maker</title>
</svelte:head>

<main class="maker-shell">
	<MakerSidebar />
	<div class="maker-main">
		<MakerHeader />
		<div class="maker-canvas">
			<Canvas scene={session.scene} controller={session.tool} bind:ctx={session.ctx} />
		</div>
		<Instructions />
		<PhaseBar />
	</div>
</main>

<SymbolPickerSheet />

<SymbolOverlay
	open={session.symbolOverlayOpen}
	onclose={() => (session.symbolOverlayOpen = false)}
/>

<style>
	.maker-shell {
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		min-height: 0;
		border: 1px solid rgba(245, 240, 219, 0.26);
		border-radius: var(--radius);
		background: rgba(242, 236, 214, 0.9);
		box-shadow: 0 18px 45px var(--shadow);
		overflow: hidden;
	}

	.maker-main {
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		min-width: 0;
		min-height: 0;
	}

	.maker-canvas {
		flex: 1 1 auto;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 12px;
		overflow: hidden;
	}

	/* On wider screens, lay the sidebar beside the workspace and cap the overall width. The
	   breakpoint sits just above layout.css's 1050px one, below which the app shell stops being
	   height-locked — the sidebar needs that lock so its label grid scrolls instead of growing. */
	@media (min-width: 1051px) {
		.maker-shell {
			flex-direction: row;
			width: min(1140px, 100%);
			margin: 0 auto;
		}
	}
</style>
