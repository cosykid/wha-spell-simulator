import {
	clamp,
	degreesToRadians,
	distance,
	normalizeAngleDeg,
	pathLength
} from '../utils/geometry.js';
import type {
	Dictionary,
	DictionaryEntry,
	Point,
	RecognitionKind,
	Stroke,
	TemplateMatchOptions,
	Vector
} from '../types.js';

const POINT_CLOUD_SIZE = 128;
const POINT_DISTANCE_NORMALIZER = 0.42;
const INK_MAP_SIZE = 40;
const INK_RADIUS = 1;
const CHAMFER_DISTANCE_NORMALIZER = 0.2;
const EXPLAINED_DISTANCE = 2.6 / INK_MAP_SIZE;
const SOFT_DISTANCE = 2.2 / INK_MAP_SIZE;
const SIMPLIFIED_TEMPLATE_STROKE_MIN_LENGTH = 0.07;

type KnownRecognitionKind = Exclude<RecognitionKind, 'unknown'>;

interface ShapeNormalizeOptions {
	pointCount?: number;
	rotationDeg?: number;
	inkSize?: number;
}

export interface RecognitionExample {
	id: string;
	kind: KnownRecognitionKind;
	symbolId: string;
	strokes: Point[][];
	source: string;
	rotationInvariant: boolean;
	allowedRotationsDeg?: number[];
}

export interface NormalizedShape {
	strokes: Vector[][];
	pointCloud: Vector[];
}

export interface InkDistanceMap {
	size: number;
	mask: Uint8Array;
	inkPixels: number[];
	distanceMap: Float32Array;
	ink: number;
}

export interface ChamferScore {
	chamferDistance: number;
	chamferScore: number;
	candidateExplainedRatio: number;
	templateCoveredRatio: number;
	unexplainedInkRatio: number;
	missingInkRatio: number;
	softDiceScore: number;
	inkScore: number;
	contaminationRisk: number;
}

export interface ShapeMatcherResult extends ChamferScore {
	available: boolean;
	confidence: number;
	$pDistance: number;
	pScore: number;
	directDistance: number;
	rotationDeg: number;
	recognitionRotationDeg: number;
}

interface ExampleCacheEntry {
	shape: NormalizedShape;
	ink: InkDistanceMap;
}

const exampleCache = new WeakMap<RecognitionExample, ExampleCacheEntry>();

function asPointArray(stroke: Point[] | Stroke): Point[] {
	return Array.isArray(stroke) ? stroke : (stroke.points ?? []);
}

function boundsForVectors(points: Vector[]) {
	if (!points.length) {
		return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
	}

	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const point of points) {
		minX = Math.min(minX, point.x);
		minY = Math.min(minY, point.y);
		maxX = Math.max(maxX, point.x);
		maxY = Math.max(maxY, point.y);
	}

	return {
		minX,
		minY,
		maxX,
		maxY,
		width: maxX - minX,
		height: maxY - minY
	};
}

function rotateNormalizedPoint(point: Vector, rotationDeg = 0): Vector {
	if (!rotationDeg) {
		return point;
	}

	const radians = degreesToRadians(rotationDeg);
	const cos = Math.cos(radians);
	const sin = Math.sin(radians);
	const x = point.x - 0.5;
	const y = point.y - 0.5;
	return {
		x: x * cos - y * sin + 0.5,
		y: x * sin + y * cos + 0.5
	};
}

function resamplePoints(points: Vector[], targetCount: number): Vector[] {
	if (!points.length || targetCount <= 0) {
		return [];
	}
	if (points.length === 1 || targetCount === 1) {
		return Array.from({ length: targetCount }, () => ({ ...points[0] }));
	}

	const cumulative = [0];
	for (let index = 1; index < points.length; index += 1) {
		cumulative.push(cumulative[index - 1] + distance(points[index - 1], points[index]));
	}

	const total = cumulative[cumulative.length - 1];
	if (total <= 0.0001) {
		return Array.from({ length: targetCount }, () => ({ ...points[0] }));
	}

	const samples: Vector[] = [];
	let segmentIndex = 1;
	for (let sample = 0; sample < targetCount; sample += 1) {
		const target = (total * sample) / Math.max(1, targetCount - 1);
		while (segmentIndex < cumulative.length - 1 && cumulative[segmentIndex] < target) {
			segmentIndex += 1;
		}

		const previousDistance = cumulative[segmentIndex - 1];
		const nextDistance = cumulative[segmentIndex];
		const local = clamp(
			(target - previousDistance) / Math.max(0.0001, nextDistance - previousDistance)
		);
		const previous = points[segmentIndex - 1];
		const next = points[segmentIndex];
		samples.push({
			x: previous.x + (next.x - previous.x) * local,
			y: previous.y + (next.y - previous.y) * local
		});
	}

	return samples;
}

function sampleCountsForStrokes(strokes: Vector[][], pointCount: number): number[] {
	if (!strokes.length) {
		return [];
	}

	const lengths = strokes.map((stroke) => pathLength(stroke));
	const totalLength = lengths.reduce((sum, length) => sum + length, 0);
	const baseCounts = strokes.map(() => 1);
	let remaining = Math.max(0, pointCount - baseCounts.length);

	if (remaining <= 0) {
		return baseCounts;
	}

	const shares = lengths.map((length) =>
		totalLength > 0.0001 ? (length / totalLength) * remaining : remaining / strokes.length
	);
	const fractional = shares.map((share, index) => ({
		index,
		fraction: share - Math.floor(share)
	}));
	const counts = baseCounts.map((base, index) => base + Math.floor(shares[index]));
	remaining = pointCount - counts.reduce((sum, count) => sum + count, 0);

	for (const item of fractional.sort((a, b) => b.fraction - a.fraction)) {
		if (remaining <= 0) {
			break;
		}
		counts[item.index] += 1;
		remaining -= 1;
	}

	while (counts.reduce((sum, count) => sum + count, 0) > pointCount) {
		const largest = counts.reduce((best, count, index) => (count > counts[best] ? index : best), 0);
		if (counts[largest] <= 1) {
			break;
		}
		counts[largest] -= 1;
	}

	return counts;
}

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

function distanceMapForMask(mask: Uint8Array, size: number, inkPixels: number[]): Float32Array {
	const result = new Float32Array(size * size);
	if (!inkPixels.length) {
		result.fill(1);
		return result;
	}

	for (let index = 0; index < result.length; index += 1) {
		if (mask[index]) {
			result[index] = 0;
			continue;
		}

		const x = index % size;
		const y = Math.floor(index / size);
		let bestSq = Infinity;
		for (const inkIndex of inkPixels) {
			const inkX = inkIndex % size;
			const inkY = Math.floor(inkIndex / size);
			const dx = x - inkX;
			const dy = y - inkY;
			bestSq = Math.min(bestSq, dx * dx + dy * dy);
		}
		result[index] = Math.min(1, Math.sqrt(bestSq) / size);
	}

	return result;
}

function renderNormalizedInk(strokes: Vector[][], size = INK_MAP_SIZE): InkDistanceMap {
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

function emptyMatcherResult(): ShapeMatcherResult {
	return {
		available: false,
		confidence: 0,
		$pDistance: 1,
		pScore: 0,
		directDistance: 1,
		rotationDeg: 0,
		recognitionRotationDeg: 0,
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

export function normalizeStrokesForShape(
	strokes: Array<Point[] | Stroke>,
	options: ShapeNormalizeOptions = {}
): NormalizedShape {
	const pointCount = options.pointCount ?? POINT_CLOUD_SIZE;
	const sourceStrokes = strokes
		.map(asPointArray)
		.filter((points) => points.length > 0)
		.map((points) => points.map((point) => ({ x: point.x, y: point.y })));
	const points = sourceStrokes.flat();

	if (!points.length) {
		return {
			strokes: [],
			pointCloud: []
		};
	}

	const bounds = boundsForVectors(points);
	const scale = Math.max(bounds.width, bounds.height, 0.0001);
	const center = {
		x: bounds.minX + bounds.width / 2,
		y: bounds.minY + bounds.height / 2
	};
	const normalizedStrokes = sourceStrokes.map((stroke) =>
		stroke.map((point) =>
			rotateNormalizedPoint(
				{
					x: (point.x - center.x) / scale + 0.5,
					y: (point.y - center.y) / scale + 0.5
				},
				options.rotationDeg ?? 0
			)
		)
	);
	const sampleCounts = sampleCountsForStrokes(normalizedStrokes, pointCount);
	const pointCloud = normalizedStrokes.flatMap((stroke, index) =>
		resamplePoints(stroke, sampleCounts[index] ?? 0)
	);

	return {
		strokes: normalizedStrokes,
		pointCloud
	};
}

export function renderInkDistanceMap(
	strokes: Array<Point[] | Stroke>,
	options: ShapeNormalizeOptions = {}
): InkDistanceMap {
	return renderNormalizedInk(
		normalizeStrokesForShape(strokes, options).strokes,
		options.inkSize ?? INK_MAP_SIZE
	);
}

function greedyCloudDistance(a: Vector[], b: Vector[]): number {
	if (!a.length || !b.length) {
		return 1;
	}

	const used = new Uint8Array(b.length);
	let total = 0;
	for (const point of a) {
		let bestIndex = -1;
		let bestDistance = Infinity;
		for (let index = 0; index < b.length; index += 1) {
			if (used[index]) {
				continue;
			}
			const itemDistance = distance(point, b[index]);
			if (itemDistance < bestDistance) {
				bestDistance = itemDistance;
				bestIndex = index;
			}
		}
		if (bestIndex >= 0) {
			used[bestIndex] = 1;
			total += bestDistance;
		}
	}

	return total / Math.max(1, Math.min(a.length, b.length));
}

export function pointCloudDistance(a: Vector[], b: Vector[]): number {
	if (!a.length || !b.length) {
		return 1;
	}

	const rawDistance = (greedyCloudDistance(a, b) + greedyCloudDistance(b, a)) / 2;
	return clamp(rawDistance / POINT_DISTANCE_NORMALIZER);
}

export function pointCloudDistanceForStrokes(
	a: Array<Point[] | Stroke>,
	b: Array<Point[] | Stroke>,
	options: ShapeNormalizeOptions = {}
): number {
	return pointCloudDistance(
		normalizeStrokesForShape(a, options).pointCloud,
		normalizeStrokesForShape(b, options).pointCloud
	);
}

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

function rotationSet(options: TemplateMatchOptions): number[] {
	if (Array.isArray(options.allowedRotationsDeg) && options.allowedRotationsDeg.length) {
		return options.allowedRotationsDeg.map(normalizeAngleDeg);
	}
	if (options.rotationInvariant) {
		return [0, 45, 90, 135, 180, 225, 270, 315];
	}
	return [0];
}

function cachedExample(example: RecognitionExample): ExampleCacheEntry {
	const cached = exampleCache.get(example);
	if (cached) {
		return cached;
	}

	const shape = normalizeStrokesForShape(example.strokes);
	const ink = renderNormalizedInk(shape.strokes);
	const entry = { shape, ink };
	exampleCache.set(example, entry);
	return entry;
}

export function scoreRecognitionExample(
	candidateStrokes: Array<Point[] | Stroke>,
	example: RecognitionExample,
	options: TemplateMatchOptions = {}
): ShapeMatcherResult {
	if (!candidateStrokes.length || !example.strokes.length) {
		return emptyMatcherResult();
	}

	const exampleShape = cachedExample(example);
	if (!exampleShape.shape.pointCloud.length || !exampleShape.ink.ink) {
		return emptyMatcherResult();
	}

	const rotations = rotationSet({
		rotationInvariant: options.rotationInvariant ?? example.rotationInvariant,
		allowedRotationsDeg: options.allowedRotationsDeg ?? example.allowedRotationsDeg
	});
	let best = emptyMatcherResult();

	for (const rotationDeg of rotations) {
		const candidateShape = normalizeStrokesForShape(candidateStrokes, { rotationDeg });
		const candidateInk = renderNormalizedInk(candidateShape.strokes);
		const $pDistance = pointCloudDistance(candidateShape.pointCloud, exampleShape.shape.pointCloud);
		const pScore = clamp(1 - $pDistance);
		const chamfer = scoreChamferDistance(candidateInk, exampleShape.ink);
		const directScore = clamp(pScore * 0.55 + chamfer.chamferScore * 0.45);
		const directDistance = clamp(1 - directScore);

		if (directScore > best.confidence) {
			best = {
				available: true,
				confidence: directScore,
				$pDistance,
				pScore,
				directDistance,
				rotationDeg,
				recognitionRotationDeg: rotationDeg,
				...chamfer
			};
		}
	}

	return best;
}

function exampleFromEntry(
	kind: KnownRecognitionKind,
	entry: DictionaryEntry
): RecognitionExample | null {
	if (!entry.strokeTemplate?.strokes?.length) {
		return null;
	}

	return {
		id: `${kind}:${entry.id}:dictionary-template`,
		kind,
		symbolId: entry.id,
		strokes: entry.strokeTemplate.strokes,
		source: 'dictionary',
		rotationInvariant: entry.recognitionRotationInvariant ?? kind === 'sigil',
		allowedRotationsDeg: entry.allowedRotationsDeg
	};
}

function simplifiedExampleFromEntry(
	kind: KnownRecognitionKind,
	entry: DictionaryEntry
): RecognitionExample | null {
	if (!entry.strokeTemplate?.strokes?.length) {
		return null;
	}

	const simplifiedStrokes = entry.strokeTemplate.strokes.filter(
		(stroke) => pathLength(stroke) >= SIMPLIFIED_TEMPLATE_STROKE_MIN_LENGTH
	);
	if (
		simplifiedStrokes.length < 2 ||
		simplifiedStrokes.length === entry.strokeTemplate.strokes.length
	) {
		return null;
	}

	return {
		id: `${kind}:${entry.id}:dictionary-simplified-template`,
		kind,
		symbolId: entry.id,
		strokes: simplifiedStrokes,
		source: 'dictionary:simplified',
		rotationInvariant: entry.recognitionRotationInvariant ?? kind === 'sigil',
		allowedRotationsDeg: entry.allowedRotationsDeg
	};
}

export function buildExamplesFromDictionary(dictionary: Dictionary): RecognitionExample[] {
	return [
		...dictionary.sigils
			.flatMap((entry) => [
				exampleFromEntry('sigil', entry),
				simplifiedExampleFromEntry('sigil', entry)
			])
			.filter((entry): entry is RecognitionExample => Boolean(entry)),
		...dictionary.signs
			.flatMap((entry) => [
				exampleFromEntry('sign', entry),
				simplifiedExampleFromEntry('sign', entry)
			])
			.filter((entry): entry is RecognitionExample => Boolean(entry))
	];
}

export function recognitionKey(kind: RecognitionKind, id: string | null | undefined): string {
	return `${kind}:${id ?? 'unknown'}`;
}
