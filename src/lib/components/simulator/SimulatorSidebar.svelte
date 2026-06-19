<!--
@component
Tabbed right rail for simulator reference content.

The sidebar groups the dictionary reference, draggable shape palette, and
diagnostics panel behind one root tab state. It does not own drawing state; shape
editing and drag events are forwarded to the route so canvas and recognition
state remain centralized.
-->
<script lang="ts">
	import Diagnostics from '$lib/components/Diagnostics.svelte';
	import DictionaryReference from '$lib/components/DictionaryReference.svelte';
	import ShapePalette from '$lib/components/ShapePalette.svelte';
	import type { Dictionary, PlacementTransform, ShapeItem, ShapeLibrary } from '$lib/types.js';
	import type { RootTab, SelectedShape, SimulatorDiagnostics } from '$lib/ui/simulator/types.js';

	interface Props {
		dictionary?: Dictionary | null;
		shapeLibrary?: ShapeLibrary | null;
		armedShapeId?: string | null;
		selected?: SelectedShape | null;
		diagnostics: SimulatorDiagnostics;
		rootTab?: RootTab;
		onDragStart: (item: ShapeItem, event: PointerEvent) => void;
		onShapeChange: (patch: Partial<PlacementTransform>) => void;
		onCommitTransform: () => void;
		onCommitShape: () => void;
		onRemoveShape: () => void;
	}

	let {
		dictionary = null,
		shapeLibrary = null,
		armedShapeId = null,
		selected = null,
		diagnostics,
		rootTab = $bindable('dictionary'),
		onDragStart,
		onShapeChange,
		onCommitTransform,
		onCommitShape,
		onRemoveShape
	}: Props = $props();
</script>

<aside class="dictionary-panel" aria-label="Dictionary and diagnostics">
	<div class="panel-tabs">
		<button
			type="button"
			class="panel-tab-button"
			class:active={rootTab === 'dictionary'}
			onclick={() => (rootTab = 'dictionary')}
		>
			Dictionary
		</button>
		<button
			type="button"
			class="panel-tab-button"
			class:active={rootTab === 'shapes'}
			onclick={() => (rootTab = 'shapes')}
		>
			Shapes
		</button>
		<button
			type="button"
			class="panel-tab-button"
			class:active={rootTab === 'diagnostic'}
			onclick={() => (rootTab = 'diagnostic')}
		>
			Diagnostic
		</button>
	</div>

	<section id="dictionaryRootPanel" hidden={rootTab !== 'dictionary'}>
		<DictionaryReference {dictionary} />
	</section>

	<section id="shapesRootPanel" hidden={rootTab !== 'shapes'}>
		<ShapePalette
			library={shapeLibrary}
			{armedShapeId}
			{selected}
			{onDragStart}
			onChange={onShapeChange}
			{onCommitTransform}
			onCommit={onCommitShape}
			onRemove={onRemoveShape}
		/>
	</section>

	<section id="diagnosticRootPanel" hidden={rootTab !== 'diagnostic'}>
		<Diagnostics {diagnostics} />
	</section>
</aside>
