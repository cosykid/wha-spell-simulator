<!--
@component
Main drawing surface for the spell simulator.

This component owns the canvas markup and immediate canvas controls: undo/redo,
clear, arrange, eraser, zoom, and pan. The simulator session owns recognition,
rendering, controller state, and command handlers.
-->
<script lang="ts">
	import Eraser from 'lucide-svelte/icons/eraser';
	import Hand from 'lucide-svelte/icons/hand';
	import Move from 'lucide-svelte/icons/move';
	import Redo2 from 'lucide-svelte/icons/redo-2';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import Undo2 from 'lucide-svelte/icons/undo-2';
	import ZoomIn from 'lucide-svelte/icons/zoom-in';
	import ZoomOut from 'lucide-svelte/icons/zoom-out';
	import CanvasIconButton from './CanvasIconButton.svelte';
	import type { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';

	interface Props {
		simulator: SimulatorSession;
	}

	let { simulator }: Props = $props();
	let ui = $derived(simulator.ui);
	let pan = $derived(simulator.pan);
	let actions = $derived(simulator.actions);
	let recognition = $derived(simulator.recognition);
</script>

<section class="canvas-panel" aria-label="Spell drawing surface">
	<div
		class="canvas-shell"
		data-testid="canvas-shell"
		bind:this={ui.canvasShell}
		class:portal-active={recognition.summary.portalActive}
		role="region"
		aria-label="Spell drawing canvas"
		tabindex="-1"
	>
		<p
			class="canvas-hint"
			id="canvasHint"
			data-testid="canvas-hint"
			class:hidden={recognition.summary.hintHidden}
			class:below-actions={!recognition.summary.hintHidden && !recognition.summary.undoDisabled}
		>
			Draw an open spell ring. Place sigils in the center and signs around them. When everything is
			ready, seal the circle to awaken the spell.
		</p>
		<div
			class="canvas-action-controls"
			class:hidden={!recognition.summary.hintHidden && recognition.summary.undoDisabled}
			aria-label="Canvas actions"
		>
			<CanvasIconButton
				id="undoButton"
				testId="undo-button"
				label="Undo"
				disabled={recognition.summary.undoDisabled}
				onclick={actions.undo}
			>
				<Undo2 aria-hidden="true" />
			</CanvasIconButton>
			<CanvasIconButton
				id="redoButton"
				testId="redo-button"
				label="Redo"
				disabled={recognition.summary.redoDisabled}
				onclick={actions.redo}
			>
				<Redo2 aria-hidden="true" />
			</CanvasIconButton>
			<CanvasIconButton
				id="clearButton"
				testId="clear-button"
				label="Clear"
				onclick={actions.clear}
			>
				<Trash2 aria-hidden="true" />
			</CanvasIconButton>
		</div>
		<div
			class="canvas-container"
			data-testid="canvas-container"
			onpointerdown={pan.start}
			tabindex="0"
			aria-label="Canvas container for panning"
			role="button"
			style="transform: translate({pan.panX}px, {pan.panY}px) scale({ui.zoomLevel});"
		>
			<canvas
				id="glyphCanvas"
				data-testid="glyph-canvas"
				data-input-ready={ui.inputReady}
				bind:this={ui.glyphCanvas}
				class:locked={recognition.summary.canvasLocked}
				width="1000"
				height="1000"
			></canvas>
		</div>
		<canvas
			id="effectCanvas"
			data-testid="effect-canvas"
			bind:this={ui.effectCanvas}
			width="1000"
			height="1000"
			style="transform: scale({ui.zoomLevel});"
		></canvas>
		<div class="zoom-controls" aria-label="Canvas zoom controls">
			<CanvasIconButton
				id="arrangeToggle"
				testId="arrange-toggle"
				buttonClass="tool-btn"
				active={ui.activeTool === 'arrange'}
				pressed={ui.activeTool === 'arrange'}
				label="Arrange shapes"
				onclick={simulator.handleToggleArrange}
			>
				<Hand aria-hidden="true" />
			</CanvasIconButton>
			<CanvasIconButton
				id="eraserToggle"
				testId="eraser-toggle"
				buttonClass="tool-btn"
				active={ui.activeTool === 'erase'}
				pressed={ui.activeTool === 'erase'}
				label="Eraser"
				onclick={simulator.handleToggleEraser}
			>
				<Eraser aria-hidden="true" />
			</CanvasIconButton>
			<CanvasIconButton
				buttonClass="zoom-btn"
				label="Zoom out"
				disabled={ui.zoomLevel <= ui.zoomMin}
				onclick={ui.zoomOut}
			>
				<ZoomOut aria-hidden="true" />
			</CanvasIconButton>
			<CanvasIconButton
				id="panToggle"
				buttonClass="zoom-btn"
				active={ui.panEnabled}
				pressed={ui.panEnabled}
				label="Pan"
				onclick={simulator.handleTogglePan}
			>
				<Move aria-hidden="true" />
			</CanvasIconButton>
			<CanvasIconButton
				buttonClass="zoom-btn"
				label="Zoom in"
				disabled={ui.zoomLevel >= ui.zoomMax}
				onclick={ui.zoomIn}
			>
				<ZoomIn aria-hidden="true" />
			</CanvasIconButton>
		</div>
	</div>
</section>

<style>
	.canvas-container {
		position: absolute;
		inset: 0;
		z-index: 1;
		width: 100%;
		height: 100%;
		transform-origin: center center;
		transition: transform 0.22s cubic-bezier(0.25, 1, 0.5, 1);
		will-change: transform;
		transform-style: preserve-3d;
	}

	.zoom-controls {
		position: absolute;
		top: 12px;
		right: 12px;
		z-index: 5;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.canvas-action-controls {
		position: absolute;
		top: 12px;
		left: 12px;
		z-index: 5;
		display: flex;
		align-items: center;
		gap: 6px;
		opacity: 1;
		transition:
			opacity 140ms ease,
			transform 140ms ease;
	}

	.canvas-action-controls.hidden {
		opacity: 0;
		pointer-events: none;
		transform: translateY(-3px);
	}

	.canvas-hint {
		position: absolute;
		top: 22px;
		left: 24px;
		z-index: 2;
		width: min(390px, calc(100% - 48px));
		margin: 0;
		color: rgba(36, 27, 22, 0.62);
		font-size: 15px;
		line-height: 1.35;
		text-align: left;
		pointer-events: none;
		transition: opacity 140ms ease;
	}

	.canvas-hint.hidden {
		opacity: 0;
	}

	/*
	 * The canvas control buttons are rendered by the child CanvasIconButton via a
	 * dynamic `class={buttonClass}`, so they sit outside this component's scope.
	 * Target them with :global, bounded by the locally-rendered wrappers so the
	 * styling stays co-located with the controls it belongs to.
	 */
	.zoom-controls :global(.zoom-btn) {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		min-height: 34px;
		padding: 0;
		font-weight: 600;
		font-size: 20px;
		line-height: 1;
		user-select: none;
		touch-action: manipulation;
	}

	.zoom-controls :global(.zoom-btn.active) {
		color: #f6f0d6;
		border-color: var(--teal);
		background: var(--teal);
		box-shadow: 0 1px 2px rgba(16, 34, 38, 0.32) inset;
	}

	.zoom-controls :global(.zoom-btn.active:hover) {
		background: #1a606a;
	}

	.zoom-controls :global(.tool-btn) {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		min-height: 34px;
		padding: 0;
		color: var(--ink);
	}

	.zoom-controls :global(.tool-btn.active) {
		color: #f6f0d8;
		border-color: var(--teal);
		background: var(--teal);
		box-shadow: 0 1px 2px rgba(16, 34, 38, 0.32) inset;
	}

	.zoom-controls :global(.tool-btn.active:hover) {
		background: #1a606a;
	}

	.zoom-controls :global(svg) {
		width: 18px;
		height: 18px;
		display: block;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.25;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.canvas-action-controls :global(button) {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		min-height: 34px;
		padding: 0;
		color: var(--ink);
	}

	.canvas-action-controls :global(svg) {
		width: 18px;
		height: 18px;
		display: block;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.25;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.zoom-controls :global(.zoom-btn)::after,
	.zoom-controls :global(.tool-btn)::after,
	.canvas-action-controls :global(button)::after {
		position: absolute;
		top: calc(100% + 8px);
		z-index: 6;
		content: attr(data-tooltip);
		min-width: max-content;
		border: 1px solid rgba(36, 27, 22, 0.14);
		border-radius: 3px;
		padding: 3px 6px;
		color: rgba(36, 27, 22, 0.72);
		background: rgba(255, 248, 224, 0.9);
		box-shadow: 0 4px 10px rgba(36, 27, 22, 0.08);
		font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
		font-size: 11px;
		font-weight: 400;
		line-height: 1.2;
		opacity: 0;
		pointer-events: none;
		transform: translateY(-2px);
		transition:
			opacity 120ms ease,
			transform 120ms ease;
	}

	.zoom-controls :global(.zoom-btn)::after {
		right: 0;
	}

	.zoom-controls :global(.tool-btn)::after,
	.canvas-action-controls :global(button)::after {
		left: 0;
	}

	.zoom-controls :global(.zoom-btn:hover)::after,
	.zoom-controls :global(.zoom-btn:focus)::after,
	.zoom-controls :global(.tool-btn:hover)::after,
	.zoom-controls :global(.tool-btn:focus)::after,
	.canvas-action-controls :global(button:hover)::after,
	.canvas-action-controls :global(button:focus)::after {
		opacity: 1;
		transform: translateY(0);
	}

	@media (max-width: 1050px) {
		.canvas-hint {
			top: 14px;
			left: 14px;
			width: min(330px, calc(100% - 28px));
			font-size: 13px;
		}
	}
</style>
