<script lang="ts">
	import ControlPanel from '$lib/components/ControlPanel.svelte';
	import Header from '$lib/components/Header.svelte';
	import ShapeDragOverlay from '$lib/components/simulator/ShapeDragOverlay.svelte';
	import SimulatorCanvasPanel from '$lib/components/simulator/SimulatorCanvasPanel.svelte';
	import SimulatorFooter from '$lib/components/simulator/SimulatorFooter.svelte';
	import SimulatorSidebar from '$lib/components/simulator/SimulatorSidebar.svelte';
	import { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';
	import { onMount } from 'svelte';

	const simulator = new SimulatorSession();

	onMount(() => simulator.mount());
</script>

<svelte:head>
	<title>Witch Hat Atelier Spell Simulator</title>
</svelte:head>

<div class="app-shell simulator-shell">
	<Header title="Glyph Compiler" eyebrow="Witch Hat Atelier Spell Simulator" />

	<main
		class="workspace"
		class:canvas-height-matched={simulator.ui.canvasHeightMatched}
		bind:this={simulator.ui.workspace}
	>
		<ControlPanel
			summary={simulator.recognition.summary}
			bind:showGuides={simulator.ui.showGuides}
			bind:showDiagnostics={simulator.ui.showDiagnostics}
			onToggleGuides={simulator.handleToggleGuides}
		/>

		<SimulatorCanvasPanel
			summary={simulator.recognition.summary}
			inputReady={simulator.ui.inputReady}
			activeTool={simulator.ui.activeTool}
			panEnabled={simulator.ui.panEnabled}
			zoomLevel={simulator.ui.zoomLevel}
			zoomMin={simulator.ui.zoomMin}
			zoomMax={simulator.ui.zoomMax}
			panX={simulator.pan.panX}
			panY={simulator.pan.panY}
			bind:glyphCanvas={simulator.ui.glyphCanvas}
			bind:effectCanvas={simulator.ui.effectCanvas}
			bind:canvasShell={simulator.ui.canvasShell}
			onStartPan={simulator.pan.start}
			onUndo={simulator.actions.undo}
			onRedo={simulator.actions.redo}
			onClear={simulator.actions.clear}
			onToggleArrange={simulator.handleToggleArrange}
			onToggleEraser={simulator.handleToggleEraser}
			onZoomOut={simulator.ui.zoomOut}
			onTogglePan={simulator.handleTogglePan}
			onZoomIn={simulator.ui.zoomIn}
		/>

		<SimulatorSidebar
			dictionary={simulator.recognition.dictionary}
			shapeLibrary={simulator.recognition.shapeLibrary}
			armedShapeId={simulator.shapeDrag.armedShapeId}
			selected={simulator.drawing.selected}
			diagnostics={simulator.recognition.diagnostics}
			bind:rootTab={simulator.ui.rootTab}
			onDragStart={simulator.shapeDrag.begin}
			onShapeChange={simulator.actions.updateSelectedTransform}
			onCommitTransform={simulator.actions.pushHistory}
			onCommitShape={simulator.actions.commitSelected}
			onRemoveShape={simulator.actions.removeSelectedShape}
		/>
	</main>

	{#if simulator.shapeDrag.dragPreview}
		<ShapeDragOverlay preview={simulator.shapeDrag.dragPreview} />
	{/if}

	<SimulatorFooter />
</div>
