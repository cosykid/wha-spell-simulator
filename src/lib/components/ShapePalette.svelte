<script lang="ts">
	import type { PlacementTransform, ShapeItem, ShapeLibrary } from '$lib/types.js';
	import { strokesToPreviewPolylines } from '$lib/ui/strokePreview.js';

	interface SelectedShape {
		kind: string;
		sourceId: string;
		transform: PlacementTransform;
	}

	interface Props {
		library?: ShapeLibrary | null;
		armedShapeId?: string | null;
		selected?: SelectedShape | null;
		onDragStart: (item: ShapeItem, event: PointerEvent) => void;
		onChange: (patch: Partial<PlacementTransform>) => void;
		onCommitTransform: () => void;
		onCommit: () => void;
		onRemove: () => void;
	}

	let {
		library = null,
		armedShapeId = null,
		selected = null,
		onDragStart,
		onChange,
		onCommitTransform,
		onCommit,
		onRemove
	}: Props = $props();

	const groups = $derived(
		library
			? [
					{ title: 'Ring', items: [library.ring] },
					{ title: 'Sigils', items: library.sigils },
					{ title: 'Signs', items: library.signs }
				].filter((group) => group.items.length)
			: []
	);

	function patchField(field: keyof PlacementTransform, value: string) {
		onChange({ [field]: Number(value) });
	}
</script>

<section class="reference-panel" aria-label="Shape palette">
	<p class="panel-description">
		Drag a ring, sigil, or sign onto the canvas. Select a placed shape to move, scale, elongate, or
		rotate it.
	</p>

	<div class="shape-palette">
		{#each groups as group (group.title)}
			<div class="shape-group">
				<h3 class="shape-group-title">{group.title}</h3>
				<div class="shape-card-grid">
					{#each group.items as item (item.id)}
						{@const polylines = strokesToPreviewPolylines(item.baseStrokes)}
						<button type="button" class="shape-card" class:armed={armedShapeId === item.id}>
							{#if polylines.length}
								<span
									class="reference-preview"
									aria-hidden="true"
									onpointerdown={(event) => onDragStart(item, event)}
								>
									<svg viewBox="0 0 100 100" role="img" focusable="false">
										{#each polylines as points (points)}
											<polyline {points}></polyline>
										{/each}
									</svg>
								</span>
							{/if}
							<span class="shape-card-label">
								<strong>{item.label}</strong>
								{#if item.element}<span>{item.element}</span>{/if}
							</span>
						</button>
					{/each}
				</div>
			</div>
		{/each}
	</div>

	<div class="shape-inspector">
		{#if selected}
			<div class="shape-inspector-card">
				<div class="reference-card-header">
					<strong>{selected.sourceId}</strong>
					<span>{selected.kind}</span>
				</div>
				<label class="shape-field">
					Width
					<input
						type="range"
						min="24"
						max="1200"
						value={Math.round(selected.transform.scaleX)}
						oninput={(event) => patchField('scaleX', event.currentTarget.value)}
						onchange={onCommitTransform}
					/>
				</label>
				<label class="shape-field">
					Height
					<input
						type="range"
						min="24"
						max="1200"
						value={Math.round(selected.transform.scaleY)}
						oninput={(event) => patchField('scaleY', event.currentTarget.value)}
						onchange={onCommitTransform}
					/>
				</label>
				<label class="shape-field">
					Rotation
					<input
						type="range"
						min="-180"
						max="180"
						value={Math.round(selected.transform.rotationDeg)}
						oninput={(event) => patchField('rotationDeg', event.currentTarget.value)}
						onchange={onCommitTransform}
					/>
				</label>
				<button type="button" class="shape-commit" onclick={onCommit}>Place shape (lock)</button>
				<button type="button" class="shape-remove" onclick={onRemove}>Remove shape</button>
				<p class="panel-description">
					Locking bakes the shape into the drawing as ink. It can no longer be moved, but you can
					draw over it.
				</p>
			</div>
		{:else}
			<p class="panel-description">Select a placed shape to move, scale, elongate, or rotate it.</p>
		{/if}
	</div>
</section>

<style>
	.shape-palette {
		display: grid;
		gap: 12px;
		flex: 1 1 auto;
		overflow-y: auto;
		overflow-x: hidden;
		/* Reaching the end of the palette must not start scrolling the drawer behind it. */
		overscroll-behavior: contain;
		scrollbar-gutter: stable;
		min-height: 0;
	}

	.shape-group-title {
		margin: 0 0 6px;
		font-family: 'Cinzel', serif;
		font-size: 13px;
		text-transform: uppercase;
		color: var(--muted-ink);
	}

	.shape-card-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(86px, 1fr));
		gap: 8px;
	}

	.shape-card {
		display: grid;
		justify-items: center;
		gap: 6px;
		padding: 8px;
		border: 1px solid rgba(36, 27, 22, 0.14);
		border-radius: 6px;
		background: rgba(255, 251, 233, 0.82);
		cursor: pointer;
		transition: background var(--dur-hover) ease;
	}

	.shape-card:hover {
		background: rgba(255, 242, 197, 0.78);
	}

	.shape-card.armed {
		border-color: var(--teal);
		box-shadow: 0 0 0 1px var(--teal);
	}

	.shape-card .reference-preview {
		width: 100%;
		/* Without this, a wide glyph's SVG min-content inflates the card's auto grid
		   track, so width: 100% overflows the content box and the box drifts off-center. */
		min-width: 0;
		cursor: grab;
		touch-action: none;
		user-select: none;
	}

	.shape-card .reference-preview:active {
		cursor: grabbing;
	}

	.shape-card-label {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		width: 100%;
		min-width: 0;
		font-size: 12px;
		line-height: 1.12;
		text-align: center;
	}

	.shape-card-label strong,
	.shape-card-label span {
		max-width: 100%;
		overflow-wrap: anywhere;
	}

	.shape-card-label span {
		color: var(--muted-ink);
		font-size: 11px;
		text-transform: capitalize;
	}

	.shape-inspector {
		flex: 0 0 auto;
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid rgba(36, 27, 22, 0.16);
	}

	.shape-inspector-card {
		display: grid;
		gap: 8px;
	}

	.shape-field {
		display: grid;
		gap: 4px;
		font-size: 12px;
		color: var(--muted-ink);
	}

	.shape-field input[type='range'] {
		width: 100%;
	}

	.shape-commit {
		margin-top: 4px;
		background: var(--teal);
		color: #fffbe9;
	}

	.shape-remove {
		margin-top: 2px;
	}
</style>
