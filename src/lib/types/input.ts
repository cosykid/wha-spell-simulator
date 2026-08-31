// Input-capture contracts: stroke drawing, erasing, and stroke storage.

import type { Point, Stroke, Vector } from './geometry.js';

export interface DrawingCaptureCallbacks {
	onStart?: () => void;
	onPreview?: (stroke: Stroke | null) => void;
	onCommit?: () => void;
	// Fired when a primary pointer lands while capture is locked. The host may
	// clear the lock's cause in response (tearing a spent page), but the
	// swallowed gesture never inks either way.
	onLockedPointerDown?: () => void;
}

export interface EraserControllerApi {
	// Fired on pointerdown, before the first erase is applied (the caller
	// cancels in-flight recognition here).
	onBegin(): void;
	// Apply erasure along the pointer's movement; returns true when ink changed.
	applyErase(from: Vector, to: Vector): boolean;
	// Fired once when the gesture ends; `changed` reports whether any ink was
	// erased so the caller can record a single undo step for the whole gesture.
	onCommit(changed: boolean): void;
}

export interface StrokeStore {
	addStroke(points: Point[]): Stroke;
	undo(): Stroke | null;
	redo(): Stroke | null;
	clear(): void;
	scale(scaleX: number, scaleY: number): void;
	load(strokes: Stroke[]): void;
	getStrokes(): Stroke[];
	peekStrokes(): Stroke[];
	count(): number;
	canRedo(): boolean;
}
