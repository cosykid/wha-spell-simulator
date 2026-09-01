<!--
@component
The dictionary panel inside the right reference drawer: sample spells, sigils,
and signs, each a list of cards carrying a stroke thumbnail and a source note.

The tab strip, the blurb, and the cards share one scroll column, so they share a
right edge and the scrollbar rides a single channel beside them. The strip
sticks to the top of that column, so a tab stays one click away however far the
list is scrolled.
-->
<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import ReferenceCard from './ReferenceCard.svelte';
	import StrokePreview from './StrokePreview.svelte';
	import { elementTag } from '$lib/ui/elementTag.js';
	import type { Dictionary, DictionaryEntry, SampleSpell } from '$lib/types.js';

	type ReferenceEntry = DictionaryEntry & { element?: string; sourceNotes?: string };
	type TabId = 'sample' | 'sigils' | 'signs';

	interface Props {
		dictionary?: Dictionary | null;
	}

	let { dictionary = null }: Props = $props();

	const TABS: { id: TabId; label: string; description: string }[] = [
		{
			id: 'sample',
			label: 'Sample Spells',
			description: 'Sample spells show complete seal layouts you can use as drawing references.'
		},
		{
			id: 'sigils',
			label: 'Sigils',
			description:
				'Sigils, typically placed in the center of a seal, control what type of spell a seal will generate.'
		},
		{
			id: 'signs',
			label: 'Signs',
			description:
				'Signs control what form spells will take. They serve as modifiers, allowing the effect of a spell to be altered.'
		}
	];

	let activeTab = $state<TabId>('sample');
	let scroller = $state<HTMLElement | null>(null);
	let scrolled = $state(false);

	// Only the active tab's cards are mounted, so an open note is remembered here
	// rather than on the card, and reopens the same way when you come back to it.
	const openNotes = new SvelteSet<string>();

	function toggleNote(key: string) {
		if (openNotes.has(key)) {
			openNotes.delete(key);
		} else {
			openNotes.add(key);
		}
	}

	// Switching tabs swaps the whole list, so the column returns to the top and the
	// strip drops the cover it only wears over scrolled content.
	$effect(() => {
		void activeTab;
		if (scroller) scroller.scrollTop = 0;
		scrolled = false;
	});

	const activeDescription = $derived(TABS.find((tab) => tab.id === activeTab)?.description ?? '');
	const sampleSpells = $derived(dictionary?.sampleSpells ?? []);
	const sigils = $derived(dictionary?.sigils ?? []);
	const signs = $derived(dictionary?.signs ?? []);
</script>

{#snippet sampleCard(sample: SampleSpell)}
	{@const manifestations = sample.manifestations?.length
		? sample.manifestations.join(', ')
		: 'none'}
	<article class="reference-card {sample.strokes?.length ? 'has-template' : ''}">
		<StrokePreview strokes={sample.strokes} />
		<div class="reference-card-body">
			<div class="reference-card-header">
				<strong>{sample.displayName ?? sample.id}</strong>
			</div>
			<p class="reference-card-description">{sample.description}</p>
			<dl>
				<div>
					<dt>Element</dt>
					<dd>{sample.element ?? 'none'}</dd>
				</div>
				<div>
					<dt>Manifestations</dt>
					<dd>{manifestations}</dd>
				</div>
			</dl>
		</div>
	</article>
{/snippet}

{#snippet entryCard(entry: ReferenceEntry, kind: 'sigil' | 'sign')}
	{@const name = entry.displayName ?? entry.id}
	{@const key = `${kind}:${entry.id}`}
	<ReferenceCard
		{name}
		strokes={entry.strokeTemplate?.strokes}
		tag={kind === 'sigil' ? elementTag(name, entry.element) : null}
		note={entry.sourceNotes}
		expanded={openNotes.has(key)}
		onToggle={() => toggleNote(key)}
	/>
{/snippet}

<section class="reference-panel" aria-label="Dictionary reference">
	<div
		class="reference-scroll"
		bind:this={scroller}
		onscroll={() => (scrolled = (scroller?.scrollTop ?? 0) > 0)}
	>
		<div class="reference-tab-bar" class:covering={scrolled}>
			<div class="reference-tabs">
				{#each TABS as tab (tab.id)}
					<button
						type="button"
						class="dictionary-tab-button"
						class:active={activeTab === tab.id}
						onclick={() => (activeTab = tab.id)}
					>
						{tab.label}
					</button>
				{/each}
			</div>
		</div>

		<p class="panel-description">{activeDescription}</p>

		<div class="reference-cards">
			{#if activeTab === 'sample'}
				{#each sampleSpells as sample (sample.id)}
					{@render sampleCard(sample)}
				{/each}
			{:else if activeTab === 'sigils'}
				{#each sigils as entry (entry.id)}
					{@render entryCard(entry, 'sigil')}
				{/each}
			{:else}
				{#each signs as entry (entry.id)}
					{@render entryCard(entry, 'sign')}
				{/each}
			{/if}
		</div>
	</div>
</section>

<style>
	/* The panel's one scroll column, so the tab strip, the blurb and the cards all
	   share its width and line up on both edges. Its bleed past the drawer padding
	   and its reserved gutter are the shared panel rule in tabs.css. */
	.reference-scroll {
		min-height: 0;
		flex: 1 1 auto;
		overflow-y: auto;
		overflow-x: hidden;
		/* Reaching the end of the list must not start scrolling the drawer behind it. */
		overscroll-behavior: contain;
	}

	/* The gap below the tabs is padding rather than margin so the bar's cover runs
	   unbroken down to the first card. */
	.reference-tab-bar {
		position: sticky;
		top: 0;
		z-index: 1;
		padding-bottom: 12px;
		transition: box-shadow var(--dur-fade) ease;
	}

	/* Only once cards are passing beneath does the bar take on the drawer's frosted
	   parchment. Painting it at rest too would lay a second wash over the panel and
	   band it just below the tabs. */
	.reference-tab-bar.covering {
		background: var(--drawer-glass);
		-webkit-backdrop-filter: blur(var(--drawer-blur)) saturate(1.1);
		backdrop-filter: blur(var(--drawer-blur)) saturate(1.1);
		box-shadow: 0 10px 16px -12px rgba(36, 27, 22, 0.45);
	}

	.panel-description {
		margin-bottom: 12px;
	}

	.reference-cards {
		display: grid;
		gap: 10px;
	}

	/* Element and manifestation names arrive lowercase, so they are cased here to
	   read like the element tag beside a sigil's name. */
	.reference-card dd {
		text-transform: capitalize;
	}
</style>
