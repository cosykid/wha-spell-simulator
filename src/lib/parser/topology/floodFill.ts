import type { Vector } from '../../types.js';
import { cellCenter, gridIndex } from './raster.js';
import type { QueueState, Raster } from './types.js';

function enqueueWater(index: number, raster: Raster, queueState: QueueState): void {
	if (raster.blocked[index] || raster.water[index]) {
		return;
	}
	raster.water[index] = 1;
	queueState.queue[queueState.tail] = index;
	queueState.tail += 1;
}

/**
 * Flood-fills empty space from the raster border.
 *
 * Blocked cells stop the fill; any empty cells left dry afterward are enclosed
 * by the drawn boundary.
 */
export function floodExterior(raster: Raster): void {
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

/** Finds dry connected components left after the exterior flood fill. */
export function findDryComponents(raster: Raster): { componentCount: number; largest: number[] } {
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

/** Collects the ink cells touching exterior water and their source stroke ids. */
export function collectOutsideEdge(raster: Raster): { edgePixels: Vector[]; strokeIds: string[] } {
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
