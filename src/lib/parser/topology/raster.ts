import { boundsForStrokes, distance } from '../../utils/geometry.js';
import type { Stroke, Vector } from '../../types.js';
import { CELL_SIZE_PX, PADDING_PX, STROKE_RADIUS_PX, STROKE_SAMPLE_STEP_PX } from './constants.js';
import type { Raster } from './types.js';

/** Canvas-space center point for one raster cell. */
export function cellCenter(index: number, raster: Raster): Vector {
	const x = index % raster.width;
	const y = Math.floor(index / raster.width);
	return {
		x: raster.offsetX + (x + 0.5) * raster.cellSize,
		y: raster.offsetY + (y + 0.5) * raster.cellSize
	};
}

/** Creates a padded local raster around the source strokes. */
export function createRaster(strokes: Stroke[]): Raster {
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

/** Converts x/y raster coordinates to a linear cell index. */
export function gridIndex(x: number, y: number, width: number): number {
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

/** Rasterizes strokes as blocking ink disks along each segment. */
export function rasterizeStrokes(strokes: Stroke[], raster: Raster): void {
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

/** Counts nonzero cells in a binary raster mask. */
export function countCells(mask: Uint8Array): number {
	let count = 0;
	for (const value of mask) {
		count += value ? 1 : 0;
	}
	return count;
}
