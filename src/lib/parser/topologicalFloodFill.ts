import { boundsForStrokes, clamp, distance, mean, stddev } from '../utils/geometry.js';
import type { AppConfig, Bounds, Stroke, Vector } from '../types.js';

const CELL_SIZE_PX = 1;
const PADDING_PX = 18;
const STROKE_RADIUS_PX = 3;
const STROKE_SAMPLE_STEP_PX = 0.75;
const MIN_ENCLOSED_AREA_PX = 3500;
const MIN_ENCLOSED_AREA_RATIO = 0.08;
const MAX_NORMALIZED_RMSE = 0.18;
const MIN_PERFECTION = 0.28;

interface Raster {
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

interface QueueState {
	queue: Int32Array;
	head: number;
	tail: number;
}

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

function cellCenter(index: number, raster: Raster): Vector {
	const x = index % raster.width;
	const y = Math.floor(index / raster.width);
	return {
		x: raster.offsetX + (x + 0.5) * raster.cellSize,
		y: raster.offsetY + (y + 0.5) * raster.cellSize
	};
}

function createRaster(strokes: Stroke[]): Raster {
	const strokeRadius = STROKE_RADIUS_PX;
	const padding = PADDING_PX + strokeRadius + 2;
	const cellSize = CELL_SIZE_PX;
	const sourceBounds = boundsForStrokes(strokes);
	const offsetX = Math.floor(sourceBounds.minX - padding);
	const offsetY = Math.floor(sourceBounds.minY - padding);
	const maxX = Math.ceil(sourceBounds.maxX + padding);
	const maxY = Math.ceil(sourceBounds.maxY + padding);
	const width = Math.max(3, Math.ceil((maxX - offsetX) / cellSize) + 1);
	const height = Math.max(3, Math.ceil((maxY - offsetY) / cellSize) + 1);
	const size = width * height;

	return {
		width,
		height,
		size,
		offsetX,
		offsetY,
		cellSize,
		sourceBounds,
		blocked: new Uint8Array(size),
		water: new Uint8Array(size),
		outsideEdge: new Uint8Array(size),
		strokeIdsByCell: new Array<Set<string> | undefined>(size)
	};
}

function gridIndex(x: number, y: number, width: number): number {
	return y * width + x;
}

function markBlockedCell(raster: Raster, x: number, y: number, strokeId: string): void {
	if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) {
		return;
	}
	const index = gridIndex(x, y, raster.width);
	raster.blocked[index] = 1;
	let cell = raster.strokeIdsByCell[index];
	if (!cell) {
		cell = new Set();
		raster.strokeIdsByCell[index] = cell;
	}
	cell.add(strokeId);
}

function markInkDisk(raster: Raster, point: Vector, radiusPx: number, strokeId: string): void {
	const gx = (point.x - raster.offsetX) / raster.cellSize;
	const gy = (point.y - raster.offsetY) / raster.cellSize;
	const radius = radiusPx / raster.cellSize;
	const minX = Math.floor(gx - radius);
	const maxX = Math.ceil(gx + radius);
	const minY = Math.floor(gy - radius);
	const maxY = Math.ceil(gy + radius);
	const radiusSquared = radius * radius;

	for (let y = minY; y <= maxY; y += 1) {
		for (let x = minX; x <= maxX; x += 1) {
			const dx = x + 0.5 - gx;
			const dy = y + 0.5 - gy;
			if (dx * dx + dy * dy <= radiusSquared) {
				markBlockedCell(raster, x, y, strokeId);
			}
		}
	}
}

function rasterizeStrokes(strokes: Stroke[], raster: Raster): void {
	const sampleStep = STROKE_SAMPLE_STEP_PX;
	const strokeRadius = STROKE_RADIUS_PX;

	for (const stroke of strokes) {
		if (!stroke.points?.length) {
			continue;
		}
		markInkDisk(raster, stroke.points[0], strokeRadius, stroke.id);
		for (let index = 1; index < stroke.points.length; index += 1) {
			const previous = stroke.points[index - 1];
			const current = stroke.points[index];
			const segmentLength = distance(previous, current);
			const steps = Math.max(1, Math.ceil(segmentLength / sampleStep));
			for (let step = 1; step <= steps; step += 1) {
				const t = step / steps;
				markInkDisk(
					raster,
					{
						x: previous.x + (current.x - previous.x) * t,
						y: previous.y + (current.y - previous.y) * t
					},
					strokeRadius,
					stroke.id
				);
			}
		}
	}
}

function enqueueWater(index: number, raster: Raster, queueState: QueueState): void {
	if (raster.blocked[index] || raster.water[index]) {
		return;
	}
	raster.water[index] = 1;
	queueState.queue[queueState.tail] = index;
	queueState.tail += 1;
}

// Same idea as the bucket fill tool in MS Paint: start filling empty space from
// the outside border. Ink blocks the fill, so any empty cells left dry afterward
// are enclosed by the drawn boundary.
function floodExterior(raster: Raster): void {
	const queueState: QueueState = {
		queue: new Int32Array(raster.size),
		head: 0,
		tail: 0
	};

	for (let x = 0; x < raster.width; x += 1) {
		enqueueWater(gridIndex(x, 0, raster.width), raster, queueState);
		enqueueWater(gridIndex(x, raster.height - 1, raster.width), raster, queueState);
	}
	for (let y = 1; y < raster.height - 1; y += 1) {
		enqueueWater(gridIndex(0, y, raster.width), raster, queueState);
		enqueueWater(gridIndex(raster.width - 1, y, raster.width), raster, queueState);
	}

	const directions = [
		[1, 0],
		[-1, 0],
		[0, 1],
		[0, -1]
	];

	while (queueState.head < queueState.tail) {
		const index = queueState.queue[queueState.head];
		queueState.head += 1;
		const x = index % raster.width;
		const y = Math.floor(index / raster.width);

		for (const [dx, dy] of directions) {
			const nx = x + dx;
			const ny = y + dy;
			if (nx < 0 || ny < 0 || nx >= raster.width || ny >= raster.height) {
				continue;
			}
			const neighbor = gridIndex(nx, ny, raster.width);
			if (raster.blocked[neighbor]) {
				raster.outsideEdge[neighbor] = 1;
			} else {
				enqueueWater(neighbor, raster, queueState);
			}
		}
	}
}

function findDryComponents(raster: Raster): { componentCount: number; largest: number[] } {
	const visited = new Uint8Array(raster.size);
	const queue = new Int32Array(raster.size);
	const directions = [
		[1, 0],
		[-1, 0],
		[0, 1],
		[0, -1]
	];
	let componentCount = 0;
	let largest: number[] = [];

	for (let start = 0; start < raster.size; start += 1) {
		if (raster.blocked[start] || raster.water[start] || visited[start]) {
			continue;
		}

		componentCount += 1;
		const cells: number[] = [];
		let head = 0;
		let tail = 0;
		visited[start] = 1;
		queue[tail] = start;
		tail += 1;

		while (head < tail) {
			const index = queue[head];
			head += 1;
			cells.push(index);
			const x = index % raster.width;
			const y = Math.floor(index / raster.width);

			for (const [dx, dy] of directions) {
				const nx = x + dx;
				const ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= raster.width || ny >= raster.height) {
					continue;
				}
				const neighbor = gridIndex(nx, ny, raster.width);
				if (!raster.blocked[neighbor] && !raster.water[neighbor] && !visited[neighbor]) {
					visited[neighbor] = 1;
					queue[tail] = neighbor;
					tail += 1;
				}
			}
		}

		if (cells.length > largest.length) {
			largest = cells;
		}
	}

	return {
		componentCount,
		largest
	};
}

function collectOutsideEdge(raster: Raster): { edgePixels: Vector[]; strokeIds: string[] } {
	const edgePixels: Vector[] = [];
	const strokeIds = new Set<string>();

	for (let index = 0; index < raster.size; index += 1) {
		if (!raster.outsideEdge[index]) {
			continue;
		}
		edgePixels.push(cellCenter(index, raster));
		for (const strokeId of raster.strokeIdsByCell[index] ?? []) {
			strokeIds.add(strokeId);
		}
	}

	return {
		edgePixels,
		strokeIds: [...strokeIds]
	};
}

function scoreCircle(edgePixels: Vector[]) {
	if (edgePixels.length < 8) {
		return {
			center: { x: 0, y: 0 },
			radius: 0,
			rmse: Infinity,
			normalizedRmse: Infinity,
			perfection: 0
		};
	}

	const center = {
		x: mean(edgePixels.map((point) => point.x)),
		y: mean(edgePixels.map((point) => point.y))
	};
	const distances = edgePixels.map((point) => distance(point, center));
	const radius = mean(distances);

	// root mean square of radial errors against the average radius.
	// Dividing it by radius makes the circle score scale-invariant across paper sizes.
	const rmse = stddev(distances);
	const normalizedRmse = rmse / Math.max(1, radius);
	const perfection = clamp(1 - normalizedRmse / MAX_NORMALIZED_RMSE);

	return {
		center,
		radius,
		rmse,
		normalizedRmse,
		perfection
	};
}

function countCells(mask: Uint8Array): number {
	let count = 0;
	for (const value of mask) {
		count += value ? 1 : 0;
	}
	return count;
}

// Closure is a topology test first, then a circle-quality test. Rasterize the
// strokes as ink, flood-fill the outside empty space, and look for unreachable
// dry cells. A ring is closed only when the dry area is large enough and its
// outside ink edge is still circular enough to count as the spell boundary.
export function analyzeTopologicalClosure(strokes: Stroke[], config: AppConfig): TopologyResult {
	if (!strokes.length) {
		return {
			closed: false,
			enclosedAreaPx: 0,
			componentCount: 0,
			edgePixelCount: 0,
			strokeIds: []
		};
	}

	const raster = createRaster(strokes);
	rasterizeStrokes(strokes, raster);
	floodExterior(raster);

	const dry = findDryComponents(raster);

	// The largest empty area the outside fill could not reach.
	const enclosedAreaPx = dry.largest.length * raster.cellSize * raster.cellSize;

	// The local raster workspace, used to scale the minimum area.
	const boundsAreaPx = raster.width * raster.height * raster.cellSize * raster.cellSize;

	const minAreaPx = Math.max(MIN_ENCLOSED_AREA_PX, boundsAreaPx * MIN_ENCLOSED_AREA_RATIO);
	const edge = collectOutsideEdge(raster);
	const circle = scoreCircle(edge.edgePixels);
	const closed =
		enclosedAreaPx >= minAreaPx &&
		circle.radius >= config.ring.minRadius &&
		circle.perfection >= MIN_PERFECTION;

	return {
		closed,
		enclosedAreaPx,
		minEnclosedAreaPx: minAreaPx,
		componentCount: dry.componentCount,
		center: circle.center,
		radius: circle.radius,
		rmse: circle.rmse,
		normalizedRmse: circle.normalizedRmse,
		perfection: circle.perfection,
		edgePixelCount: edge.edgePixels.length,
		edgePixels: edge.edgePixels,
		strokeIds: edge.strokeIds,
		raster: {
			width: raster.width,
			height: raster.height,
			cellSize: raster.cellSize,
			offsetX: raster.offsetX,
			offsetY: raster.offsetY,
			blockedPixelCount: countCells(raster.blocked),
			waterPixelCount: countCells(raster.water),
			dryPixelCount: dry.largest.length
		}
	};
}
