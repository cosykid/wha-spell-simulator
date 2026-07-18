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

const EDT_INFINITY = 1e20;

// One column/row of Felzenszwalb's exact squared Euclidean distance transform.
// Reads n values from f, writes n results into d, with v and z as scratch.
function edt1d(f: Float64Array, d: Float64Array, v: Int32Array, z: Float64Array, n: number): void {
	let k = 0;
	v[0] = 0;
	z[0] = -EDT_INFINITY;
	z[1] = EDT_INFINITY;

	for (let q = 1; q < n; q += 1) {
		let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
		while (s <= z[k]) {
			k -= 1;
			s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
		}
		k += 1;
		v[k] = q;
		z[k] = s;
		z[k + 1] = EDT_INFINITY;
	}

	k = 0;
	for (let q = 0; q < n; q += 1) {
		while (z[k + 1] < q) {
			k += 1;
		}
		const dx = q - v[k];
		d[q] = dx * dx + f[v[k]];
	}
}

// Exact Euclidean distance transform in two 1D passes. Produces the same map
// as scanning every ink pixel per output pixel but in O(size^2) instead of
// O(size^2 * ink), which matters because recognition builds one map per
// candidate rotation per template comparison.
function distanceMapForMask(mask: Uint8Array, size: number, inkPixels: number[]): Float32Array {
	const result = new Float32Array(size * size);
	if (!inkPixels.length) {
		result.fill(1);
		return result;
	}

	const squared = new Float64Array(size * size);
	for (let index = 0; index < squared.length; index += 1) {
		squared[index] = mask[index] ? 0 : EDT_INFINITY;
	}

	const f = new Float64Array(size);
	const d = new Float64Array(size);
	const v = new Int32Array(size);
	const z = new Float64Array(size + 1);

	for (let x = 0; x < size; x += 1) {
		for (let y = 0; y < size; y += 1) {
			f[y] = squared[y * size + x];
		}
		edt1d(f, d, v, z, size);
		for (let y = 0; y < size; y += 1) {
			squared[y * size + x] = d[y];
		}
	}

	for (let y = 0; y < size; y += 1) {
		const row = y * size;
		for (let x = 0; x < size; x += 1) {
			f[x] = squared[row + x];
		}
		edt1d(f, d, v, z, size);
		for (let x = 0; x < size; x += 1) {
			result[row + x] = Math.min(1, Math.sqrt(d[x]) / size);
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
