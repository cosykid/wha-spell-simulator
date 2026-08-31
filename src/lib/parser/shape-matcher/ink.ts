import { clamp } from '../../utils/geometry.js';
import type { Point, Stroke, Vector } from '../../types.js';
import {
	CHAMFER_DISTANCE_NORMALIZER,
	EXPLAINED_DISTANCE,
	INK_MAP_SIZE,
	INK_RADIUS,
	SOFT_DISTANCE
} from './constants.js';
import { normalizeStrokesForShape } from './normalization.js';
import type { ChamferScore, InkDistanceMap, ShapeNormalizeOptions } from './types.js';

function markMask(mask: Uint8Array, size: number, x: number, y: number, radius = INK_RADIUS): void {
	const centerX = Math.round(clamp(x, 0, 1) * (size - 1));
	const centerY = Math.round(clamp(y, 0, 1) * (size - 1));
	const radiusSq = radius * radius;

	for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
		for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
			if (offsetX * offsetX + offsetY * offsetY > radiusSq) {
				continue;
			}
			const pixelX = centerX + offsetX;
			const pixelY = centerY + offsetY;
			if (pixelX < 0 || pixelX >= size || pixelY < 0 || pixelY >= size) {
				continue;
			}
			mask[pixelY * size + pixelX] = 1;
		}
	}
}

function drawSegment(mask: Uint8Array, size: number, start: Vector, end: Vector): void {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) * size * 2));

	for (let index = 0; index <= steps; index += 1) {
		const local = index / steps;
		markMask(mask, size, start.x + dx * local, start.y + dy * local);
	}
}

/** Squared distance standing in for "no ink on this line yet". */
const UNREACHED = 1e20;

/**
 * Replaces one row of squared distances with the lower envelope of the parabolas
 * rooted at its samples, which is the exact 1D distance transform.
 *
 * Run down the columns and then across the rows, this composes into the exact
 * squared distance to the nearest ink pixel (Felzenszwalb and Huttenlocher). It
 * reads every cell a fixed number of times, where measuring each cell against
 * every ink pixel grows with the ink and dominated the whole template pass.
 */
function lowerEnvelope1d(
	line: Float64Array,
	count: number,
	out: Float64Array,
	vertices: Int32Array,
	breaks: Float64Array
): void {
	let top = 0;
	vertices[0] = 0;
	breaks[0] = -UNREACHED;
	breaks[1] = UNREACHED;

	for (let index = 1; index < count; index += 1) {
		let crossing =
			(line[index] + index * index - (line[vertices[top]] + vertices[top] * vertices[top])) /
			(2 * index - 2 * vertices[top]);
		while (crossing <= breaks[top]) {
			top -= 1;
			crossing =
				(line[index] + index * index - (line[vertices[top]] + vertices[top] * vertices[top])) /
				(2 * index - 2 * vertices[top]);
		}
		top += 1;
		vertices[top] = index;
		breaks[top] = crossing;
		breaks[top + 1] = UNREACHED;
	}

	top = 0;
	for (let index = 0; index < count; index += 1) {
		while (breaks[top + 1] < index) {
			top += 1;
		}
		const offset = index - vertices[top];
		out[index] = offset * offset + line[vertices[top]];
	}
}

function distanceMapForMask(mask: Uint8Array, size: number, inkPixels: number[]): Float32Array {
	const result = new Float32Array(size * size);
	if (!inkPixels.length) {
		result.fill(1);
		return result;
	}

	const squared = new Float64Array(size * size);
	for (let index = 0; index < squared.length; index += 1) {
		squared[index] = mask[index] ? 0 : UNREACHED;
	}

	const line = new Float64Array(size);
	const transformed = new Float64Array(size);
	const vertices = new Int32Array(size);
	const breaks = new Float64Array(size + 1);

	for (let x = 0; x < size; x += 1) {
		for (let y = 0; y < size; y += 1) {
			line[y] = squared[y * size + x];
		}
		lowerEnvelope1d(line, size, transformed, vertices, breaks);
		for (let y = 0; y < size; y += 1) {
			squared[y * size + x] = transformed[y];
		}
	}

	for (let y = 0; y < size; y += 1) {
		const row = y * size;
		for (let x = 0; x < size; x += 1) {
			line[x] = squared[row + x];
		}
		lowerEnvelope1d(line, size, transformed, vertices, breaks);
		for (let x = 0; x < size; x += 1) {
			result[row + x] = Math.min(1, Math.sqrt(transformed[x]) / size);
		}
	}

	return result;
}

/** Rasterizes normalized strokes and precomputes the map used by chamfer scoring. */
export function renderNormalizedInk(strokes: Vector[][], size = INK_MAP_SIZE): InkDistanceMap {
	const mask = new Uint8Array(size * size);

	for (const stroke of strokes) {
		if (!stroke.length) {
			continue;
		}
		if (stroke.length === 1) {
			markMask(mask, size, stroke[0].x, stroke[0].y);
			continue;
		}
		for (let index = 1; index < stroke.length; index += 1) {
			drawSegment(mask, size, stroke[index - 1], stroke[index]);
		}
	}

	const inkPixels: number[] = [];
	for (let index = 0; index < mask.length; index += 1) {
		if (mask[index]) {
			inkPixels.push(index);
		}
	}

	return {
		size,
		mask,
		inkPixels,
		distanceMap: distanceMapForMask(mask, size, inkPixels),
		ink: inkPixels.length
	};
}

/** Normalizes and rasterizes raw strokes into an ink distance map. */
export function renderInkDistanceMap(
	strokes: Array<Point[] | Stroke>,
	options: ShapeNormalizeOptions = {}
): InkDistanceMap {
	return renderNormalizedInk(
		normalizeStrokesForShape(strokes, options).strokes,
		options.inkSize ?? INK_MAP_SIZE
	);
}

function softInkCount(map: InkDistanceMap, radius: number): number {
	let count = 0;
	for (const distanceValue of map.distanceMap) {
		if (distanceValue <= radius) {
			count += 1;
		}
	}
	return count;
}

function softOverlap(a: InkDistanceMap, b: InkDistanceMap, radius: number): number {
	let overlap = 0;
	for (let index = 0; index < a.distanceMap.length; index += 1) {
		if (a.distanceMap[index] <= radius && b.distanceMap[index] <= radius) {
			overlap += 1;
		}
	}
	return overlap;
}

function explainedRatio(source: InkDistanceMap, target: InkDistanceMap, radius: number): number {
	if (!source.ink) {
		return 0;
	}

	let explained = 0;
	for (const pixel of source.inkPixels) {
		if (target.distanceMap[pixel] <= radius) {
			explained += 1;
		}
	}
	return explained / source.ink;
}

function averageDistance(source: InkDistanceMap, target: InkDistanceMap): number {
	if (!source.ink) {
		return 1;
	}

	let total = 0;
	for (const pixel of source.inkPixels) {
		total += target.distanceMap[pixel] ?? 1;
	}
	return total / source.ink;
}

/** Scores overlap between candidate and template ink distance maps. */
export function scoreChamferDistance(
	candidate: InkDistanceMap,
	template: InkDistanceMap
): ChamferScore {
	if (!candidate.ink || !template.ink) {
		return {
			chamferDistance: 1,
			chamferScore: 0,
			candidateExplainedRatio: 0,
			templateCoveredRatio: 0,
			unexplainedInkRatio: 1,
			missingInkRatio: 1,
			softDiceScore: 0,
			inkScore: 0,
			contaminationRisk: 1
		};
	}

	const candidateToTemplate = averageDistance(candidate, template);
	const templateToCandidate = averageDistance(template, candidate);
	const rawChamfer = (candidateToTemplate + templateToCandidate) / 2;
	const chamferDistance = clamp(rawChamfer / CHAMFER_DISTANCE_NORMALIZER);
	const candidateExplainedRatio = clamp(explainedRatio(candidate, template, EXPLAINED_DISTANCE));
	const templateCoveredRatio = clamp(explainedRatio(template, candidate, EXPLAINED_DISTANCE));
	const unexplainedInkRatio = clamp(1 - candidateExplainedRatio);
	const missingInkRatio = clamp(1 - templateCoveredRatio);
	const candidateSoftInk = softInkCount(candidate, SOFT_DISTANCE);
	const templateSoftInk = softInkCount(template, SOFT_DISTANCE);
	const softDiceScore =
		candidateSoftInk && templateSoftInk
			? clamp(
					(softOverlap(candidate, template, SOFT_DISTANCE) * 2) /
						(candidateSoftInk + templateSoftInk)
				)
			: 0;
	const chamferScore = clamp(1 - chamferDistance);
	const inkScore = clamp(
		chamferScore * 0.34 +
			candidateExplainedRatio * 0.26 +
			templateCoveredRatio * 0.26 +
			softDiceScore * 0.14
	);
	const contaminationRisk = clamp(
		clamp((unexplainedInkRatio - 0.28) / 0.42) * 0.62 +
			clamp((missingInkRatio - 0.48) / 0.34) * 0.24 +
			clamp((chamferDistance - 0.5) / 0.4) * 0.14
	);

	return {
		chamferDistance,
		chamferScore,
		candidateExplainedRatio,
		templateCoveredRatio,
		unexplainedInkRatio,
		missingInkRatio,
		softDiceScore,
		inkScore,
		contaminationRisk
	};
}
