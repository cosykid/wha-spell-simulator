<!--
@component
Main drawing surface for the spell simulator.

This component owns the canvas markup and immediate canvas controls: undo/redo,
clear, arrange, eraser, zoom, and pan. The route still owns all recognition,
rendering, and controller state; this panel only binds DOM nodes and dispatches
user actions through callback props.
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
	import type { SpellSummary } from '$lib/ui/spellSummary.js';
	import type { CanvasTool } from '$lib/ui/simulator/mode.js';

	interface Props {
		summary: SpellSummary;
		inputReady: boolean;
		activeTool: CanvasTool;
		panEnabled: boolean;
		zoomLevel: number;
		zoomMin: number;
		zoomMax: number;
		panX: number;
		panY: number;
		glyphCanvas?: HTMLCanvasElement;
		effectCanvas?: HTMLCanvasElement;
		canvasShell?: HTMLDivElement;
		onStartPan: (event: PointerEvent) => void;
		onUndo: () => void;
		onRedo: () => void;
		onClear: () => void;
		onToggleArrange: () => void;
		onToggleEraser: () => void;
		onZoomOut: () => void;
		onTogglePan: () => void;
		onZoomIn: () => void;
	}

	let {
		summary,
		inputReady,
		activeTool,
		panEnabled,
		zoomLevel,
		zoomMin,
		zoomMax,
		panX,
		panY,
		glyphCanvas = $bindable(),
		effectCanvas = $bindable(),
		canvasShell = $bindable(),
		onStartPan,
		onUndo,
		onRedo,
		onClear,
		onToggleArrange,
		onToggleEraser,
		onZoomOut,
		onTogglePan,
		onZoomIn
	}: Props = $props();
</script>

<section class="canvas-panel" aria-label="Spell drawing surface">
	<div
		class="canvas-shell"
		data-testid="canvas-shell"
		bind:this={canvasShell}
		class:portal-active={summary.portalActive}
		role="region"
		aria-label="Spell drawing canvas"
		tabindex="-1"
	>
		<p
			class="canvas-hint"
			id="canvasHint"
			data-testid="canvas-hint"
			class:hidden={summary.hintHidden}
			class:below-actions={!summary.hintHidden && !summary.undoDisabled}
		>
			Draw an open spell ring. Place sigils in the center and signs around them. When everything is
			ready, seal the circle to awaken the spell.
		</p>
		<div
			class="canvas-action-controls"
			class:hidden={!summary.hintHidden && summary.undoDisabled}
			aria-label="Canvas actions"
		>
			<CanvasIconButton
				id="undoButton"
				testId="undo-button"
				label="Undo"
				disabled={summary.undoDisabled}
				onclick={onUndo}
			>
				<Undo2 aria-hidden="true" />
			</CanvasIconButton>
			<CanvasIconButton
				id="redoButton"
				testId="redo-button"
				label="Redo"
				disabled={summary.redoDisabled}
				onclick={onRedo}
			>
				<Redo2 aria-hidden="true" />
			</CanvasIconButton>
			<CanvasIconButton id="clearButton" testId="clear-button" label="Clear" onclick={onClear}>
				<Trash2 aria-hidden="true" />
			</CanvasIconButton>
		</div>
		<div
			class="canvas-container"
			data-testid="canvas-container"
			onpointerdown={onStartPan}
			tabindex="0"
			aria-label="Canvas container for panning"
			role="button"
			style="transform: translate({panX}px, {panY}px) scale({zoomLevel});"
		>
			<canvas
				id="glyphCanvas"
				data-testid="glyph-canvas"
				data-input-ready={inputReady}
				bind:this={glyphCanvas}
				class:locked={summary.canvasLocked}
				width="1000"
				height="1000"
			></canvas>
		</div>
		<canvas
			id="effectCanvas"
			data-testid="effect-canvas"
			bind:this={effectCanvas}
			width="1000"
			height="1000"
			style="transform: scale({zoomLevel});"
		></canvas>
		<div class="zoom-controls" aria-label="Canvas zoom controls">
			<CanvasIconButton
				id="arrangeToggle"
				testId="arrange-toggle"
				buttonClass="tool-btn"
				active={activeTool === 'arrange'}
				pressed={activeTool === 'arrange'}
				label="Arrange shapes"
				onclick={onToggleArrange}
			>
				<Hand aria-hidden="true" />
			</CanvasIconButton>
			<CanvasIconButton
				id="eraserToggle"
				testId="eraser-toggle"
				buttonClass="tool-btn"
				active={activeTool === 'erase'}
				pressed={activeTool === 'erase'}
				label="Eraser"
				onclick={onToggleEraser}
			>
				<Eraser aria-hidden="true" />
			</CanvasIconButton>
			<CanvasIconButton
				buttonClass="zoom-btn"
				label="Zoom out"
				disabled={zoomLevel <= zoomMin}
				onclick={onZoomOut}
			>
				<ZoomOut aria-hidden="true" />
			</CanvasIconButton>
			<CanvasIconButton
				id="panToggle"
				buttonClass="zoom-btn"
				active={panEnabled}
				pressed={panEnabled}
				label="Pan"
				onclick={onTogglePan}
			>
				<Move aria-hidden="true" />
			</CanvasIconButton>
			<CanvasIconButton
				buttonClass="zoom-btn"
				label="Zoom in"
				disabled={zoomLevel >= zoomMax}
				onclick={onZoomIn}
			>
				<ZoomIn aria-hidden="true" />
			</CanvasIconButton>
		</div>
	</div>
</section>
