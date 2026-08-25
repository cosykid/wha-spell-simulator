<!--
@component
The full-bleed simulator stage. It paints the parchment surface and ornate frame,
centres the square drawing canvas, and arranges the minimal floating chrome and
the two slide-out drawers around it.

This is the simulator view's table of contents: the canvas, the chrome clusters,
and the drawers each live one named click away.
-->
<script lang="ts">
	import CanvasActionBar from './CanvasActionBar.svelte';
	import CanvasIconButton from './CanvasIconButton.svelte';
	import EffectStyleToggle from './EffectStyleToggle.svelte';
	import ArcaneMenu from './icons/ArcaneMenu.svelte';
	import ArcaneRecenter from './icons/ArcaneRecenter.svelte';
	import ArcaneZoomIn from './icons/ArcaneZoomIn.svelte';
	import ArcaneZoomOut from './icons/ArcaneZoomOut.svelte';
	import MenuDrawer from './MenuDrawer.svelte';
	import ReferenceDrawer from './ReferenceDrawer.svelte';
	import ReferenceTabs from './ReferenceTabs.svelte';
	import SaveSpellDialog from './SaveSpellDialog.svelte';
	import SimulatorCanvasPanel from './SimulatorCanvasPanel.svelte';
	import StatusReadout from './StatusReadout.svelte';
	import ToolDock from './ToolDock.svelte';
	import type { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';

	interface Props {
		simulator: SimulatorSession;
	}

	let { simulator }: Props = $props();
	let ui = $derived(simulator.ui);
	let pan = $derived(simulator.pan);
	let recognition = $derived(simulator.recognition);
</script>

<!-- The runtime's resize observer watches this element for layout re-evaluation. -->
<div class="simulator-stage" bind:this={ui.workspace}>
	<!-- The canvas lives in its own centring layer so a sliding drawer (a sibling
	     layer) can never shift it. -->
	<div class="stage-canvas">
		<div class="canvas-slot">
			<SimulatorCanvasPanel {simulator} />
		</div>
	</div>

	<!-- First-use hint. Lives at the stage (viewport) layer, not inside the canvas
	     shell, whose `perspective` traps positioned children and whose top edge sits
	     off-screen once the canvas covers the viewport. -->
	<p
		class="canvas-hint"
		id="canvasHint"
		data-testid="canvas-hint"
		class:hidden={recognition.summary.hintHidden}
	>
		Draw an open spell ring. Place sigils in the center and signs around them. When everything is
		ready, seal the circle to awaken the spell.
	</p>

	<div class="chrome chrome-tl">
		<CanvasIconButton
			buttonClass="menu-trigger"
			label="Menu"
			labelPlacement="below"
			chipAlign="left"
			pressed={ui.menuOpen}
			onclick={ui.toggleMenu}
		>
			<ArcaneMenu aria-hidden="true" />
		</CanvasIconButton>
		<CanvasActionBar {simulator} />
	</div>

	<div class="chrome chrome-left"><ToolDock {simulator} /></div>
	<div class="chrome chrome-right"><ReferenceTabs {simulator} /></div>
	<div class="chrome chrome-bc"><StatusReadout {simulator} /></div>

	<div class="chrome chrome-br">
		<EffectStyleToggle {simulator} />
		{#if pan.isOffset}
			<CanvasIconButton buttonClass="zoom-btn" label="Re-center" onclick={pan.recenter}>
				<ArcaneRecenter aria-hidden="true" />
			</CanvasIconButton>
		{/if}
		<CanvasIconButton
			buttonClass="zoom-btn"
			label="Zoom out"
			disabled={ui.zoomLevel <= ui.zoomMin}
			onclick={ui.zoomOut}
		>
			<ArcaneZoomOut aria-hidden="true" />
		</CanvasIconButton>
		<CanvasIconButton
			buttonClass="zoom-btn"
			label="Zoom in"
			chipAlign="right"
			disabled={ui.zoomLevel >= ui.zoomMax}
			onclick={ui.zoomIn}
		>
			<ArcaneZoomIn aria-hidden="true" />
		</CanvasIconButton>
	</div>

	<MenuDrawer {simulator} />
	<ReferenceDrawer {simulator} />
	<SaveSpellDialog {simulator} />
</div>

<style>
	.simulator-stage {
		position: fixed;
		inset: 0;
		/* `clip` (not `hidden`) so the off-screen drawers are clipped without making
		   the stage a scroll container, whose shifting scroll origin would otherwise
		   drag the centred canvas while a drawer slides. */
		overflow: clip;
		background:
			radial-gradient(128% 108% at 50% 42%, transparent 50%, rgba(58, 44, 30, 0.2) 100%),
			#d9cba6 url('/images/background.jpg') center / cover no-repeat;
	}

	/*
	 * Ornate frame on the left and right edges only. frame.jpg is a tall vertical
	 * border strip, so each band shows the full motif at its natural width and tiles
	 * down the viewport. The right band mirrors the left so the sawtooth outer edge
	 * faces outward on both sides.
	 */
	.simulator-stage::before,
	.simulator-stage::after {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		width: var(--frame-width);
		z-index: 6;
		pointer-events: none;
		background: url('/images/frame.jpg') top left / 100% auto repeat-y;
	}

	.simulator-stage::before {
		left: 0;
	}

	.simulator-stage::after {
		right: 0;
		transform: scaleX(-1);
	}

	.stage-canvas {
		position: absolute;
		inset: 0;
		z-index: 1;
	}

	/*
	 * Cover square: the canvas is locked to 1:1 (see canvasSizing.ts), so to fill a
	 * non-square viewport we size it to the LONG edge and centre it (overflowing the
	 * short axis equally); the stage's `overflow: clip` hides that overflow. The whole
	 * screen becomes drawable parchment, and a hand-drawn circle stays a circle in
	 * canvas space. Absolute centring (not grid `place-items`) is used because a grid's
	 * implicit track grows to an oversized item and anchors it to the top instead.
	 */
	.canvas-slot {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: max(100vw, 100vh);
		aspect-ratio: 1 / 1;
	}

	/* Sits at the top centre of the viewport, clear of the top-edge chrome row. */
	.canvas-hint {
		position: absolute;
		top: calc(var(--chrome-inset-y) + 8px);
		left: 50%;
		transform: translateX(-50%);
		z-index: 4;
		width: min(420px, calc(100vw - 120px));
		margin: 0;
		color: var(--ink-sepia-45);
		font-size: 14px;
		line-height: 1.4;
		text-align: center;
		pointer-events: none;
		transition: opacity 200ms ease;
	}

	.canvas-hint.hidden {
		opacity: 0;
	}

	/*
	 * Chrome wrappers float over the canvas but never block drawing: the wrapper is
	 * transparent to pointer input, only its actual controls capture it. Sat at the
	 * stage (screen) corners, clear of the centred canvas on wide screens.
	 */
	.chrome {
		position: absolute;
		z-index: 5;
		display: flex;
		pointer-events: none;
	}

	/*
	 * Lift the cluster with the active control so its hover name chip floats over
	 * neighbouring chrome (e.g. the Menu chip drops into the left dock's space).
	 */
	.chrome:has(:global(button:hover)),
	.chrome:has(:global(button:focus-visible)) {
		z-index: 7;
	}

	/*
	 * Re-enable input only on the actual controls (which live in child components,
	 * so they need :global to cross the scope boundary). Everything else in the
	 * wrapper stays transparent to pointers so the canvas underneath stays drawable.
	 */
	.chrome :global(button),
	.chrome :global(a),
	.chrome :global(label),
	.chrome :global(input) {
		pointer-events: auto;
	}

	.chrome-tl {
		top: var(--chrome-inset-y);
		left: var(--chrome-inset-x);
		align-items: center;
		gap: 8px;
	}

	/* Vertically centred on the left edge, clear of the centred canvas. */
	.chrome-left {
		top: 50%;
		left: var(--chrome-inset-x);
		transform: translateY(-50%);
	}

	.chrome-right {
		top: 50%;
		right: var(--chrome-inset-x);
		transform: translateY(-50%);
	}

	.chrome-bc {
		bottom: var(--chrome-inset-y);
		left: 50%;
		transform: translateX(-50%);
		max-width: min(70vw, 460px);
	}

	.chrome-br {
		bottom: var(--chrome-inset-y);
		right: var(--chrome-inset-x);
		gap: 6px;
	}

	/* The menu and zoom buttons are CanvasIconButton plates; their look lives there.
	   The chrome wrappers above own only placement. */

	/* On phones the responsive --chrome-inset already tightens spacing; only the
	   hint text needs to shrink. */
	@media (max-width: 640px) {
		.canvas-hint {
			font-size: 12px;
		}
	}
</style>
