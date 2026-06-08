<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import type { Dictionary, DictionaryEntry, Point, SampleSpell } from '$lib/types.js';

	type ReferenceEntry = DictionaryEntry & { element?: string; sourceNotes?: string };

	interface Props {
		dictionary?: Dictionary | null;
	}

	let { dictionary = null }: Props = $props();

	let activeTab = $state('sample');
	const expandedNotes = new SvelteSet<string>();
	const truncatedNotes = new SvelteSet<string>();

	function toggleNote(key: string) {
		if (expandedNotes.has(key)) {
			expandedNotes.delete(key);
		} else {
			expandedNotes.add(key);
		}
	}

	// A clamped preview that overflows gets a "Show more" toggle. Cards mount
	// inside a hidden tab (0 height), so we (re)measure once the active tab's
	// previews are laid out, and on window resize since wrapping is width-driven.
	function measureClamps() {
		const previews = document.querySelectorAll<HTMLElement>(
			'.reference-source-preview.clamped[data-note-key]'
		);
		for (const preview of previews) {
			const key = preview.dataset.noteKey;
			if (
				key &&
				!truncatedNotes.has(key) &&
				preview.clientHeight > 0 &&
				preview.scrollHeight > preview.clientHeight + 1
			) {
				truncatedNotes.add(key);
			}
		}
	}

	$effect(() => {
		// Reference activeTab so the effect re-runs when the visible tab changes
		// and newly shown previews get measured.
		void activeTab;
		const frame = requestAnimationFrame(measureClamps);
		window.addEventListener('resize', measureClamps);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener('resize', measureClamps);
		};
	});

	const sampleSpells = $derived(dictionary?.sampleSpells ?? []);
	const sigils = $derived(dictionary?.sigils ?? []);
	const signs = $derived(dictionary?.signs ?? []);

	// Project normalized 0..1 stroke points into the 100x100 preview viewBox,
	// matching the original 8 + value * 84 inset mapping.
	function toPolylines(strokes: Point[][] | undefined) {
		if (!strokes?.length) {
			return [];
		}
		return strokes
			.map((stroke) =>
				stroke
					.map((point) => {
						const x = Number(point.x);
						const y = Number(point.y);
						if (!Number.isFinite(x) || !Number.isFinite(y)) {
							return null;
						}
						const previewX = 8 + x * 84;
						const previewY = 8 + y * 84;
						return `${Math.round(previewX * 10) / 10},${Math.round(previewY * 10) / 10}`;
					})
					.filter(Boolean)
					.join(' ')
			)
			.filter((points) => points.length > 0);
	}
</script>

{#snippet strokePreview(strokes: Point[][] | undefined)}
	{@const polylines = toPolylines(strokes)}
	{#if polylines.length}
		<div class="reference-preview" aria-hidden="true">
			<svg viewBox="0 0 100 100" role="img" focusable="false">
				{#each polylines as points (points)}
					<polyline {points}></polyline>
				{/each}
			</svg>
		</div>
	{/if}
{/snippet}

{#snippet referenceCard(entry: ReferenceEntry, kind: 'sigil' | 'sign')}
	{@const template = entry.strokeTemplate ?? null}
	{@const hasTemplate = Boolean(template?.strokes?.length)}
	<article class="reference-card {hasTemplate ? 'has-template' : ''}">
		{@render strokePreview(template?.strokes)}
		<div>
			<div class="reference-card-header">
				<strong>{entry.displayName ?? entry.id}</strong>
				{#if kind === 'sigil' && entry.element}<span>{entry.element}</span>{/if}
			</div>
			{#if entry.sourceNotes}
				{@const noteKey = `${kind}:${entry.id}`}
				{@const expanded = expandedNotes.has(noteKey)}
				<p class="reference-source-preview" class:clamped={!expanded} data-note-key={noteKey}>
					{entry.sourceNotes}
				</p>
				{#if truncatedNotes.has(noteKey)}
					<button
						type="button"
						class="reference-source-toggle"
						aria-expanded={expanded}
						onclick={() => toggleNote(noteKey)}
					>
						<span>{expanded ? 'Show less' : 'Show more'}</span>
						<svg
							class="reference-source-chevron"
							viewBox="0 0 16 16"
							aria-hidden="true"
							focusable="false"
						>
							<polyline points="4,6 8,10 12,6"></polyline>
						</svg>
					</button>
				{/if}
			{/if}
		</div>
	</article>
{/snippet}

{#snippet sampleCard(sample: SampleSpell)}
	{@const hasTemplate = Boolean(sample.strokes?.length)}
	{@const manifestations = sample.manifestations?.length
		? sample.manifestations.join(', ')
		: 'none'}
	<article class="reference-card {hasTemplate ? 'has-template' : ''}">
		{@render strokePreview(sample.strokes)}
		<div>
			<div class="reference-card-header">
				<strong>{sample.displayName ?? sample.id}</strong>
				{#if sample.element}<span>{sample.element}</span>{/if}
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

<section class="reference-panel" aria-label="Dictionary reference">
	<div class="reference-tabs">
		<button
			type="button"
			class="dictionary-tab-button"
			class:active={activeTab === 'sample'}
			onclick={() => (activeTab = 'sample')}
		>
			Sample Spells
		</button>
		<button
			type="button"
			class="dictionary-tab-button"
			class:active={activeTab === 'sigils'}
			onclick={() => (activeTab = 'sigils')}
		>
			Sigils
		</button>
		<button
			type="button"
			class="dictionary-tab-button"
			class:active={activeTab === 'signs'}
			onclick={() => (activeTab = 'signs')}
		>
			Signs
		</button>
	</div>

	<div class="reference-list" hidden={activeTab !== 'sample'}>
		<p class="panel-description">
			Sample spells show complete seal layouts you can use as drawing references.
		</p>
		<div>
			{#each sampleSpells as sample (sample.id)}
				{@render sampleCard(sample)}
			{/each}
		</div>
	</div>

	<div class="reference-list" hidden={activeTab !== 'sigils'}>
		<p class="panel-description">
			Sigils, typically placed in the center of a seal, control what type of spell a seal will
			generate.
		</p>
		<div>
			{#each sigils as entry (entry.id)}
				{@render referenceCard(entry, 'sigil')}
			{/each}
		</div>
	</div>

	<div class="reference-list" hidden={activeTab !== 'signs'}>
		<p class="panel-description">
			Signs control what form spells will take. They serve as modifiers, allowing the effect of a
			spell to be altered.
		</p>
		<div>
			{#each signs as entry (entry.id)}
				{@render referenceCard(entry, 'sign')}
			{/each}
		</div>
	</div>
</section>

<style>
	.reference-source-preview {
		margin: 0;
		color: var(--muted-ink);
		font-size: 12px;
		line-height: 1.35;
	}

	/* Collapsed previews fill at most two lines (with an ellipsis) so a card is
	   never taller than its stroke thumbnail until the note is expanded. */
	.reference-source-preview.clamped {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
	}

	.reference-source-toggle {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-top: 4px;
		min-height: 0;
		padding: 0;
		border: none;
		background: none;
		box-shadow: none;
		cursor: pointer;
		color: var(--ink);
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		line-height: 1.35;
	}

	.reference-source-toggle:hover,
	.reference-source-toggle:active {
		background: none;
	}

	/* Underline only on hover/focus — the label itself stays plain. */
	.reference-source-toggle:hover span,
	.reference-source-toggle:focus-visible span {
		text-decoration: underline;
	}

	.reference-source-chevron {
		width: 14px;
		height: 14px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
		transition: transform 0.15s ease;
	}

	.reference-source-toggle[aria-expanded='true'] .reference-source-chevron {
		transform: rotate(180deg);
	}
</style>
