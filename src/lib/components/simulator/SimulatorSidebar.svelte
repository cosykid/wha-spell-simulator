<!--
@component
Tabbed right rail for simulator reference content.

The sidebar groups the dictionary reference, draggable shape palette, and
diagnostics panel behind one root tab state. The simulator session owns the
state and command handlers used by these page-specific panels.
-->
<script lang="ts">
	import Diagnostics from '$lib/components/Diagnostics.svelte';
	import DictionaryReference from '$lib/components/DictionaryReference.svelte';
	import ShapePalette from '$lib/components/ShapePalette.svelte';
	import type { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';

	interface Props {
		simulator: SimulatorSession;
	}

	let { simulator }: Props = $props();
	let ui = $derived(simulator.ui);
	let drawing = $derived(simulator.drawing);
	let recognition = $derived(simulator.recognition);
	let actions = $derived(simulator.actions);
	let shapeDrag = $derived(simulator.shapeDrag);
</script>

<aside class="dictionary-panel" aria-label="Dictionary and diagnostics">
	<div class="panel-tabs">
		<button
			type="button"
			class="panel-tab-button"
			class:active={ui.rootTab === 'dictionary'}
			onclick={() => (ui.rootTab = 'dictionary')}
		>
			Dictionary
		</button>
		<button
			type="button"
			class="panel-tab-button"
			class:active={ui.rootTab === 'shapes'}
			onclick={() => (ui.rootTab = 'shapes')}
		>
			Shapes
		</button>
		<button
			type="button"
			class="panel-tab-button"
			class:active={ui.rootTab === 'diagnostic'}
			onclick={() => (ui.rootTab = 'diagnostic')}
		>
			Diagnostic
		</button>
	</div>

	<section id="dictionaryRootPanel" hidden={ui.rootTab !== 'dictionary'}>
		<DictionaryReference dictionary={recognition.dictionary} />
	</section>

	<section id="shapesRootPanel" hidden={ui.rootTab !== 'shapes'}>
		<ShapePalette
			library={recognition.shapeLibrary}
			armedShapeId={shapeDrag.armedShapeId}
			selected={drawing.selected}
			onDragStart={shapeDrag.begin}
			onChange={actions.updateSelectedTransform}
			onCommitTransform={actions.pushHistory}
			onCommit={actions.commitSelected}
			onRemove={actions.removeSelectedShape}
		/>
	</section>

	<section id="diagnosticRootPanel" hidden={ui.rootTab !== 'diagnostic'}>
		<Diagnostics diagnostics={recognition.diagnostics} />
	</section>
</aside>

<style>
	.panel-tabs {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0;
		border-top: 0;
		padding-top: 0;
		margin-bottom: 14px;
		border-bottom: 1px solid rgba(36, 27, 22, 0.2);
	}

	#dictionaryRootPanel[hidden],
	#diagnosticRootPanel[hidden],
	#shapesRootPanel[hidden] {
		display: none;
	}
</style>
