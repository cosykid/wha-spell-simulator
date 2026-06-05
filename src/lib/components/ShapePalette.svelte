<script lang="ts">
	import type { Point, PlacementTransform, ShapeItem, ShapeLibrary } from '$lib/types.js';

	interface SelectedShape {
		kind: string;
		sourceId: string;
		transform: PlacementTransform;
	}

	interface Props {
		library?: ShapeLibrary | null;
		armedShapeId?: string | null;
		selected?: SelectedShape | null;
		onArm: (item: ShapeItem) => void;
		onChange: (patch: Partial<PlacementTransform>) => void;
		onCommitTransform: () => void;
		onCommit: () => void;
		onRemove: () => void;
	}

	let {
		library = null,
		armedShapeId = null,
		selected = null,
		onArm,
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

	// Project normalized 0..1 stroke points into the 100x100 preview viewBox.
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
						return `${Math.round((8 + x * 84) * 10) / 10},${Math.round((8 + y * 84) * 10) / 10}`;
					})
					.filter(Boolean)
					.join(' ')
			)
			.filter((points) => points.length > 0);
	}

	function patchField(field: keyof PlacementTransform, value: string) {
		onChange({ [field]: Number(value) });
	}
</script>

<section class="reference-panel" aria-label="Shape palette">
	<p class="panel-description">
		Turn on Arrange Shapes, pick a ring, sigil, or sign, then click the canvas to place it. Select a
		placed shape to move, scale, elongate, or rotate it.
	</p>

	<div class="shape-palette">
		{#each groups as group (group.title)}
			<div class="shape-group">
				<h3 class="shape-group-title">{group.title}</h3>
				<div class="shape-card-grid">
					{#each group.items as item (item.id)}
						{@const polylines = toPolylines(item.baseStrokes)}
						<button
							type="button"
							class="shape-card"
							class:armed={armedShapeId === item.id}
							onclick={() => onArm(item)}
						>
							{#if polylines.length}
								<span class="reference-preview" aria-hidden="true">
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
