// Geometry primitives shared across the whole pipeline.

export interface Vector {
	x: number;
	y: number;
}

/** A point or direction in seal or world space (see `portal/portal.ts`). */
export interface Vec3 extends Vector {
	z: number;
}

export interface Point extends Vector {
	t?: number;
}

export interface Bounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	width: number;
	height: number;
}

export interface StrokeMetrics {
	length: number;
	bounds: Bounds;
	pointCount: number;
}

export type PointerType = 'pen' | 'touch' | 'mouse' | 'unknown';

export interface Stroke {
	id: string;
	points: Point[];
	startedAt?: number;
	endedAt?: number;
	metrics?: StrokeMetrics;
	pointerType?: PointerType;
}

/** A stroke after `cleanStrokes` has attached geometry metrics. */
export interface CleanedStroke extends Stroke {
	metrics: StrokeMetrics;
}
