<!--
@component
Right slide-out reference palette: dictionary, draggable shapes, and diagnostics.
Non-modal so the canvas stays interactive while you drag shapes out of it. Which
panel shows is driven by the reference tab triggers on the canvas edge.
-->
<script lang="ts">
	import Diagnostics from '$lib/components/Diagnostics.svelte';
	import DictionaryReference from '$lib/components/DictionaryReference.svelte';
	import ShapePalette from '$lib/components/ShapePalette.svelte';
	import Drawer from './Drawer.svelte';
	import type { RootTab } from '$lib/ui/simulator/types.js';
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

	const TITLES: Record<RootTab, string> = {
		dictionary: 'Dictionary',
		shapes: 'Shapes',
		diagnostic: 'Diagnostics'
	};
</script>

<Drawer side="right" open={ui.referenceOpen} label={TITLES[ui.rootTab]} onClose={ui.closeDrawers}>
	<h2 class="ref-title">{TITLES[ui.rootTab]}</h2>

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
</Drawer>

<style>
	.ref-title {
		margin: 0 0 14px;
		padding-right: 36px;
		font-family: 'Cinzel', serif;
		font-size: 18px;
		font-weight: 600;
		color: var(--ink-sepia);
	}

	#dictionaryRootPanel[hidden],
	#diagnosticRootPanel[hidden],
	#shapesRootPanel[hidden] {
		display: none;
	}
</style>
