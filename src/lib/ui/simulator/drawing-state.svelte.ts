import { createPlacementStore } from '$lib/input/placementStore.js';
import { bakePlacementToStrokes, placementHandles } from '$lib/input/shapeBaker.js';
import { defaultTransformForShape } from '$lib/input/shapeLibrary.js';
import { createStrokeStore } from '$lib/input/strokeStore.js';
import { makePlacementEntity } from '$lib/ui/canvas/entities/placementEntity.js';
import type { Entity } from '$lib/ui/canvas/entity.js';
import type { Placement, PlacementTransform, ShapeItem, Stroke, Vector } from '$lib/types.js';
import { SvelteMap } from 'svelte/reactivity';
import { clonePlacementSnapshot, createDrawingHistory, type DrawingSnapshot } from './history.js';
import type { CanvasTool } from './mode.js';
import type { SelectedShape } from './types.js';

/**
 * Owns mutable drawing data for the simulator canvas.
 *
 * This object keeps freehand strokes, editable shape placements, selection
 * state, and undo/redo snapshots together so the route session can treat the
 * drawing as one domain model instead of coordinating several stores directly.
 */
export class SimulatorDrawingState {
	/** Freehand ink store used by pointer drawing and erasing. */
	readonly store = createStrokeStore();
	/** Editable symbol/ring placements dropped from the shape palette. */
	readonly placements = createPlacementStore();
	/** Undo/redo history covering both freehand ink and editable placements. */
	readonly history = createDrawingHistory();

	/** Snapshot consumed by the shape inspector in the sidebar. */
	selected = $state<SelectedShape | null>(null);
	#selectedPlacementId: string | null = null;
	#bakedPlacementCache = new SvelteMap<string, { key: string; strokes: Stroke[] }>();
	#placementEntityCache = new SvelteMap<string, { key: string; entity: Entity }>();

	/** Placement id currently selected on the canvas, or `null` when nothing is selected. */
	get selectedPlacementId() {
		return this.#selectedPlacementId;
	}

	/** Whether an undo snapshot is available. */
	get canUndo() {
		return this.history.canUndo;
	}

	/** Whether a redo snapshot is available. */
	get canRedo() {
		return this.history.canRedo;
	}

	/**
	 * Selects an editable placement and refreshes the sidebar-friendly selection snapshot.
	 *
	 * @param id - Placement id to select, or `null` to clear selection.
	 */
	setSelected = (id: string | null) => {
		this.#selectedPlacementId = id;
		const placement = id ? this.placements.get(id) : null;
		this.selected = placement
			? {
					kind: placement.kind,
					sourceId: placement.sourceId,
					transform: { ...placement.transform }
				}
			: null;
	};

	/**
	 * Returns the complete ink model used by recognition and rendering.
	 *
	 * Editable placements are baked to temporary strokes without mutating the
	 * placement store, so recognition sees dropped shapes and hand-drawn strokes
	 * as one drawing.
	 */
	mergedStrokes() {
		return [
			...this.store.getStrokes(),
			...this.placements
				.getPlacements()
				.flatMap((placement) => this.#bakedPlacementStrokes(placement))
		];
	}

	/** Returns freehand strokes used for per-frame glyph rendering. */
	renderInkStrokes() {
		return this.store.getStrokes();
	}

	/**
	 * Returns editable placements as Canvas entities for per-frame rendering.
	 *
	 * Recognition owns the baked Stroke[] snapshot. The live canvas uses entities
	 * so transforms can be rendered directly from placement data while dragging.
	 */
	renderPlacementEntities() {
		const entities = this.placements
			.getPlacements()
			.map((placement) => this.#placementEntity(placement));
		this.#prunePlacementEntityCache();
		return entities;
	}

	/** Pushes the current drawing into undo history. */
	pushHistory() {
		this.history.push(this.snapshot());
	}

	/** Replaces undo history with the current drawing as the initial snapshot. */
	resetHistory() {
		this.history.reset(this.snapshot());
	}

	/** Moves one snapshot backward in history. */
	undo() {
		return this.history.undo();
	}

	/** Moves one snapshot forward in history. */
	redo() {
		return this.history.redo();
	}

	/** Clears freehand strokes, placements, and selection. */
	clear() {
		this.store.clear();
		this.placements.clear();
		this.#bakedPlacementCache.clear();
		this.#placementEntityCache.clear();
		this.setSelected(null);
	}

	/**
	 * Restores strokes and placements from a history snapshot.
	 *
	 * Selection is preserved only when the selected placement still exists in the
	 * restored snapshot.
	 */
	restore(snap: DrawingSnapshot) {
		this.store.load(snap.strokes);
		this.placements.load(snap.placements);
		this.#bakedPlacementCache.clear();
		this.#placementEntityCache.clear();
		if (this.#selectedPlacementId && !this.placements.get(this.#selectedPlacementId)) {
			this.#selectedPlacementId = null;
		}
		this.setSelected(this.#selectedPlacementId);
	}

	/**
	 * Adds a palette item as an editable placement at a canvas point.
	 *
	 * @returns The id of the newly created placement.
	 */
	placeShape(item: ShapeItem, point: Vector, canvas: HTMLCanvasElement) {
		const placement = this.placements.add({
			kind: item.kind,
			sourceId: item.sourceId,
			baseStrokes: item.baseStrokes,
			transform: defaultTransformForShape(item, point, canvas)
		});
		this.setSelected(placement.id);
		return placement.id;
	}

	/**
	 * Applies a transform patch to the selected placement.
	 *
	 * @returns `true` when a selected placement was updated.
	 */
	updateSelectedTransform(patch: Partial<PlacementTransform>) {
		if (!this.#selectedPlacementId) {
			return false;
		}
		this.placements.update(this.#selectedPlacementId, patch);
		this.setSelected(this.#selectedPlacementId);
		return true;
	}

	/**
	 * Removes the selected editable placement.
	 *
	 * @returns `true` when a placement was removed.
	 */
	deleteSelectedPlacement() {
		if (!this.#selectedPlacementId) {
			return false;
		}
		const id = this.#selectedPlacementId;
		this.placements.remove(id);
		this.#bakedPlacementCache.delete(id);
		this.#placementEntityCache.delete(id);
		if (this.#selectedPlacementId === id) {
			this.setSelected(null);
		}
		return true;
	}

	/**
	 * Bakes the selected editable placement into permanent freehand strokes.
	 *
	 * @returns `true` when a placement was committed.
	 */
	commitSelectedPlacement() {
		if (!this.#selectedPlacementId) {
			return false;
		}
		const placement = this.placements.get(this.#selectedPlacementId);
		if (!placement) {
			return false;
		}
		bakePlacementToStrokes(placement).forEach((stroke) => this.store.addStroke(stroke.points));
		this.placements.remove(placement.id);
		this.#bakedPlacementCache.delete(placement.id);
		this.#placementEntityCache.delete(placement.id);
		if (this.#selectedPlacementId === placement.id) {
			this.setSelected(null);
		}
		return true;
	}

	/** Scales editable placements after the backing canvas is resized. */
	scalePlacements(scaleX: number, scaleY: number) {
		for (const placement of this.placements.getPlacements()) {
			this.placements.update(placement.id, {
				cx: placement.transform.cx * scaleX,
				cy: placement.transform.cy * scaleY,
				scaleX: placement.transform.scaleX * scaleX,
				scaleY: placement.transform.scaleY * scaleY
			});
		}
	}

	/** Returns transform handles for the selected placement while arrange mode is active. */
	selectionHandles(activeTool: CanvasTool) {
		const placement =
			activeTool === 'arrange' && this.#selectedPlacementId
				? this.placements.get(this.#selectedPlacementId)
				: null;
		return placement ? placementHandles(placement) : null;
	}

	/** Captures immutable drawing state for undo/redo history. */
	snapshot(): DrawingSnapshot {
		return {
			strokes: this.store.getStrokes(),
			placements: clonePlacementSnapshot(this.placements.getPlacements())
		};
	}

	#bakedPlacementStrokes(placement: Placement) {
		const key = this.#placementBakeKey(placement);
		const cached = this.#bakedPlacementCache.get(placement.id);
		if (cached?.key === key) {
			return cached.strokes;
		}

		const strokes = bakePlacementToStrokes(placement);
		this.#bakedPlacementCache.set(placement.id, { key, strokes });
		this.#pruneBakedPlacementCache();
		return strokes;
	}

	#placementBakeKey(placement: Placement) {
		const { transform } = placement;
		return [
			placement.sourceId,
			placement.kind,
			placement.baseStrokes.length,
			transform.cx,
			transform.cy,
			transform.scaleX,
			transform.scaleY,
			transform.rotationDeg
		].join('|');
	}

	#placementEntity(placement: Placement) {
		const key = this.#placementBakeKey(placement);
		const cached = this.#placementEntityCache.get(placement.id);
		if (cached?.key === key) {
			return cached.entity;
		}

		const entity = makePlacementEntity(placement);
		this.#placementEntityCache.set(placement.id, { key, entity });
		return entity;
	}

	#pruneBakedPlacementCache() {
		const liveIds = this.placements.getPlacements().map((placement) => placement.id);
		for (const id of this.#bakedPlacementCache.keys()) {
			if (!liveIds.includes(id)) {
				this.#bakedPlacementCache.delete(id);
			}
		}
	}

	#prunePlacementEntityCache() {
		const liveIds = this.placements.getPlacements().map((placement) => placement.id);
		for (const id of this.#placementEntityCache.keys()) {
			if (!liveIds.includes(id)) {
				this.#placementEntityCache.delete(id);
			}
		}
	}
}
