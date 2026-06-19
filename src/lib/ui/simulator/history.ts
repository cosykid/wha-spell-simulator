/**
 * Undo/redo snapshot history for simulator drawing state.
 *
 * The simulator edits two kinds of marks: freehand strokes and editable shape
 * placements. History snapshots capture both so undo/redo behaves consistently
 * across hand-drawn ink, dropped symbols, transformed placements, and canvas
 * resizing.
 *
 * @packageDocumentation
 */
import type { Placement, Stroke } from '$lib/types.js';

const MAX_HISTORY = 100;

export interface DrawingSnapshot {
	strokes: Stroke[];
	placements: Placement[];
}

function scaleSnapshot(snap: DrawingSnapshot, scaleX: number, scaleY: number): DrawingSnapshot {
	return {
		strokes: snap.strokes.map((stroke) => ({
			...stroke,
			points: stroke.points.map((point) => ({
				...point,
				x: point.x * scaleX,
				y: point.y * scaleY
			}))
		})),
		placements: snap.placements.map((placement) => ({
			...placement,
			transform: {
				...placement.transform,
				cx: placement.transform.cx * scaleX,
				cy: placement.transform.cy * scaleY,
				scaleX: placement.transform.scaleX * scaleX,
				scaleY: placement.transform.scaleY * scaleY
			}
		}))
	};
}

/**
 * Creates a bounded undo/redo history for drawing snapshots.
 *
 * @param maxHistory - Maximum number of snapshots to retain.
 * @returns Mutable history controller with undo, redo, reset, push, and scale operations.
 */
export function createDrawingHistory(maxHistory = MAX_HISTORY) {
	let snapshots: DrawingSnapshot[] = [];
	let index = -1;

	return {
		get canUndo() {
			return index > 0;
		},
		get canRedo() {
			return index < snapshots.length - 1;
		},
		reset(snapshot: DrawingSnapshot) {
			snapshots = [snapshot];
			index = 0;
		},
		push(snapshot: DrawingSnapshot) {
			snapshots = [...snapshots.slice(0, index + 1), snapshot].slice(-maxHistory);
			index = snapshots.length - 1;
		},
		undo() {
			if (index <= 0) {
				return null;
			}
			index -= 1;
			return snapshots[index];
		},
		redo() {
			if (index >= snapshots.length - 1) {
				return null;
			}
			index += 1;
			return snapshots[index];
		},
		scale(scaleX: number, scaleY: number) {
			snapshots = snapshots.map((snap) => scaleSnapshot(snap, scaleX, scaleY));
		}
	};
}

/**
 * Clones placements for storage in immutable history snapshots.
 *
 * @param placements - Current editable placements from the placement store.
 * @returns Placement copies with cloned transform objects.
 */
export function clonePlacementSnapshot(placements: Placement[]): Placement[] {
	return placements.map((placement) => ({
		...placement,
		transform: { ...placement.transform }
	}));
}
