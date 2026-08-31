<!--
@component
Right slide-out reference palette: dictionary, draggable shapes, and diagnostics.
Non-modal so the canvas stays interactive while you drag shapes out of it. Which
panel shows is driven by the reference tab triggers on the canvas edge.

On a phone the panel covers nearly the whole screen and the tab rail it was opened
from is behind it, so there it turns modal and a tap outside closes it.
-->
<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';
	import Diagnostics from '$lib/components/Diagnostics.svelte';
	import DictionaryReference from '$lib/components/DictionaryReference.svelte';
	import ShapePalette from '$lib/components/ShapePalette.svelte';
	import Drawer from './Drawer.svelte';
	import MySpellsPanel from './MySpellsPanel.svelte';
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

	// Matches the panel's own phone breakpoint in Drawer. Defaults to the desktop
	// answer during SSR, where there is no viewport to ask.
	const phone = new MediaQuery('max-width: 640px', false);

	const TITLES: Record<RootTab, string> = {
		dictionary: 'Dictionary',
		shapes: 'Shapes',
		spells: 'My Spells',
		diagnostic: 'Diagnostics'
	};
</script>

<Drawer
	side="right"
	open={ui.referenceOpen}
	label={TITLES[ui.rootTab]}
	modal={phone.current}
	onClose={ui.closeDrawers}
>
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

	<section id="spellsRootPanel" hidden={ui.rootTab !== 'spells'}>
		<MySpellsPanel {simulator} active={ui.referenceOpen && ui.rootTab === 'spells'} />
	</section>

	<section id="diagnosticRootPanel" hidden={ui.rootTab !== 'diagnostic'}>
		<Diagnostics diagnostics={recognition.diagnostics} />
	</section>
</Drawer>

<style>
	.ref-title {
		margin: 0 0 14px;
		font-family: 'Cinzel', serif;
		font-size: 18px;
		font-weight: 600;
		color: var(--ink-sepia);
	}

	#dictionaryRootPanel[hidden],
	#diagnosticRootPanel[hidden],
	#shapesRootPanel[hidden],
	#spellsRootPanel[hidden] {
		display: none;
	}
</style>
