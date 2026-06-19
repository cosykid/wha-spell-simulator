import type { Bounds, Vector } from '../../types.js';

/** Raster workspace used by the topology closure pass. */
export interface Raster {
	width: number;
	height: number;
	size: number;
	offsetX: number;
	offsetY: number;
	cellSize: number;
	sourceBounds: Bounds;
	blocked: Uint8Array;
	water: Uint8Array;
	outsideEdge: Uint8Array;
	strokeIdsByCell: Array<Set<string> | undefined>;
}

/** Queue cursor state for flood-fill traversal. */
export interface QueueState {
	queue: Int32Array;
	head: number;
	tail: number;
}

/** Compact raster diagnostics attached to topology results. */
export interface TopologyRasterSummary {
	width: number;
	height: number;
	cellSize: number;
	offsetX: number;
	offsetY: number;
	blockedPixelCount: number;
	waterPixelCount: number;
	dryPixelCount: number;
}

/** Result of testing whether strokes enclose a ring-like dry area. */
export interface TopologyResult {
	closed: boolean;
	enclosedAreaPx: number;
	minEnclosedAreaPx?: number;
	componentCount: number;
	center?: Vector;
	radius?: number;
	rmse?: number;
	normalizedRmse?: number;
	perfection?: number;
	edgePixelCount: number;
	edgePixels?: Vector[];
	strokeIds: string[];
	raster?: TopologyRasterSummary;
}
