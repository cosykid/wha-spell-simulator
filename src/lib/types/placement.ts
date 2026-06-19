// Shape placement: palette items the user stamps and transforms on the canvas.

import type { Point, Vector } from './geometry.js';
import type { ElementId } from './dictionary.js';

export type PlacementKind = 'sigil' | 'sign' | 'ring';

export interface PlacementTransform {
	cx: number;
	cy: number;
	scaleX: number;
	scaleY: number;
	rotationDeg: number;
}

export interface Placement {
	id: string;
	kind: PlacementKind;
	sourceId: string;
	baseStrokes: Point[][];
	transform: PlacementTransform;
}

/** A palette entry the user can stamp onto the canvas. */
export interface ShapeItem {
	id: string;
	kind: PlacementKind;
	sourceId: string;
	label: string;
	element: ElementId | null;
	baseStrokes: Point[][];
}

export interface ShapeLibrary {
	ring: ShapeItem;
	sigils: ShapeItem[];
	signs: ShapeItem[];
	items: ShapeItem[];
}

export interface PlacementHandle extends Vector {
	type: 'scale' | 'elongate-x' | 'elongate-x-left' | 'elongate-y' | 'elongate-y-top' | 'rotate';
}

export interface PlacementHandles {
	center: Vector;
	corners: Vector[];
	edgeHandles: PlacementHandle[];
	topMid: Vector;
	rotate: Vector;
}

export interface PlacementStore {
	add(input: Omit<Placement, 'id'>): Placement;
	update(id: string, patch: Partial<PlacementTransform>): Placement | null;
	remove(id: string): Placement | null;
	get(id: string): Placement | null;
	clear(): void;
	load(placements: Placement[]): void;
	getPlacements(): Placement[];
	count(): number;
}

export interface PlacementControllerApi {
	getSelectedId(): string | null;
	setSelectedId(id: string | null): void;
	hasArmedShape(): boolean;
	placeShape(point: Vector): string | null;
	onChange(): void;
	// Fired once when a drag gesture that actually moved a shape ends, so the caller can
	// record a single undo step for the whole gesture rather than one per pointer move.
	onInteractionEnd(): void;
}
