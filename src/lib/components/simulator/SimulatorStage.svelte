<!--
@component
The full-bleed simulator stage. It paints the parchment surface and ornate frame,
centres the square drawing canvas, and arranges the minimal floating chrome and
the two slide-out drawers around it.

This is the simulator view's table of contents: the canvas, the chrome clusters,
and the drawers each live one named click away.
-->
<script lang="ts">
	import Crosshair from 'lucide-svelte/icons/crosshair';
	import MenuIcon from 'lucide-svelte/icons/menu';
	import ZoomIn from 'lucide-svelte/icons/zoom-in';
	import ZoomOut from 'lucide-svelte/icons/zoom-out';
	import CanvasActionBar from './CanvasActionBar.svelte';
	import ChromeButton from './ChromeButton.svelte';
	import ChromeRule from './ChromeRule.svelte';
	import DrawerPeek from './DrawerPeek.svelte';
	import EffectStyleToggle from './EffectStyleToggle.svelte';
	import MenuDrawer from './MenuDrawer.svelte';
	import ReferenceDrawer from './ReferenceDrawer.svelte';
	import ReferenceTabs from './ReferenceTabs.svelte';
	import SaveSpellDialog from './SaveSpellDialog.svelte';
	import SimulatorCanvasPanel from './SimulatorCanvasPanel.svelte';
	import StatusReadout from './StatusReadout.svelte';
	import ToolDock from './ToolDock.svelte';
	import { hasPendingCast } from '$lib/ui/spells/castHandoff.js';
	import type { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';

	interface Props {
		simulator: SimulatorSession;
	}

	let { simulator }: Props = $props();
	let ui = $derived(simulator.ui);
	let pan = $derived(simulator.pan);
	let recognition = $derived(simulator.recognition);

	// Re-centring is "put the view back", so it drops the zoom along with the pan.
	// Walking 3x down to 1x otherwise costs eight presses of Zoom out.
	function resetView() {
		pan.recenter();
		ui.resetZoom();
	}

	// Drives the left-edge drawer sliver, which shows only while the menu trigger
	// has the pointer or focus. Tracked here rather than in CSS because the peek
	// is a sibling layer, not a descendant of the trigger.
	let menuHinted = $state(false);

	// A spell chosen in the library is still crossing over while the canvas boots.
	// Read once at mount: the stash is taken the moment input turns ready.
	const arrivedWithPendingCast = hasPendingCast();

	// Arrange mode drops freehand strokes, so telling the user to draw there is
	// advice the canvas will ignore. The hint names that mode's own first move.
	let hintText = $derived(
		arrivedWithPendingCast && !ui.inputReady
			? 'Fetching your spell from the library…'
			: ui.activeTool === 'arrange'
				? 'Arrange mode: pick a shape from the Shapes panel on the right, or press P to draw freehand.'
				: 'Draw an open spell ring. Place sigils in the center and signs around them. When everything is ready, seal the circle to awaken the spell. New here? Open the Dictionary on the right.'
	);
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
		{hintText}
	</p>

	<div class="chrome chrome-tl menu-zone">
		<!-- The wrapper takes the pointer back so the peek can follow the hover;
		     the .chrome layer itself stays transparent to input. -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<span
			class="menu-hover"
			onpointerenter={() => (menuHinted = true)}
			onpointerleave={() => (menuHinted = false)}
			onfocusin={() => (menuHinted = true)}
			onfocusout={() => (menuHinted = false)}
		>
			<ChromeButton
				role="opener"
				anchor="left"
				caret={false}
				showLabel
				label="Menu"
				icon={MenuIcon}
				labelPlacement="below"
				chipAlign="left"
				active={ui.menuOpen}
				onclick={ui.toggleMenu}
			/>
		</span>
	</div>

	<DrawerPeek hinted={menuHinted} />

	<!--
		One left column, read down: pick a tool, fix what you drew, keep it. The
		rule marks where the modes end and the one-shot commands begin.
	-->
	<div class="chrome chrome-left">
		<div class="tool-column">
			<ToolDock {simulator} />
			<ChromeRule />
			<CanvasActionBar {simulator} />
		</div>
	</div>

	<div class="chrome chrome-right"><ReferenceTabs {simulator} /></div>
	<div class="chrome chrome-bc"><StatusReadout {simulator} /></div>

	<div class="chrome chrome-br">
		<EffectStyleToggle {simulator} />
		<!-- Which engine performs a cast is a kept preference, not view transport
		     like the three that follow, so a standing taper parts them. -->
		<ChromeRule direction="down" />
		<!-- Always rendered, disabled at home: appearing only once you pan would
		     slide the zoom buttons sideways underneath the pointer. -->
		<ChromeButton
			role="command"
			label="Re-center"
			icon={Crosshair}
			disabled={!pan.isOffset && ui.zoomLevel === 1}
			onclick={resetView}
		/>
		<ChromeButton
			role="command"
			label="Zoom out"
			icon={ZoomOut}
			disabled={ui.zoomLevel <= ui.zoomMin}
			onclick={ui.zoomOut}
		/>
		<ChromeButton
			role="command"
			label="Zoom in"
			icon={ZoomIn}
			chipAlign="right"
			disabled={ui.zoomLevel >= ui.zoomMax}
			onclick={ui.zoomIn}
		/>
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
	}

	.menu-hover {
		display: inline-flex;
		pointer-events: auto;
	}

	.tool-column {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
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
		align-items: center;
		gap: 2px;
	}

	/* Every control is a ChromeButton and its look lives there. The chrome
	   wrappers above own only placement. */

	/* On phones the responsive --chrome-inset already tightens spacing; only the
	   hint text needs to shrink. */
	@media (max-width: 640px) {
		.canvas-hint {
			font-size: 12px;
		}
	}
</style>
