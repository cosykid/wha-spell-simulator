import {
	allPoints,
	angularDifference,
	boundsForStrokes,
	boundsOverlap,
	centerOfBounds,
	clamp,
	directedStrokeAngle,
	distance,
	dominantAxisOrientationDeg,
	endpointClosedness,
	expandBounds,
	strokeLength
} from '../utils/geometry.js';
import { summarizePolar } from './coordinateNormalizer.js';
import { createDecompositionScorer } from './symbolRecognizer.js';
import type { DecompositionScorer } from './symbolRecognizer.js';
import type { RecognitionExample } from './shapeMatcher.js';
import type {
	AppConfig,
	CleanedStroke,
	Dictionary,
	RadialFacing,
	RingInfo,
	Stroke,
	SymbolCandidate
} from '../types.js';

interface StrokeClassification {
	strokeId: string;
	usedByParser: boolean;
	canJoinSymbol: boolean;
}

const BBOX_PADDING_NORM = 0.075;
const CENTER_DISTANCE_NORM = 0.2;
const ENDPOINT_DISTANCE_NORM = 0.085;
const MAX_SYMBOL_SIZE_NORM = 0.58;
const MERGE_SCORE_FLOOR = 0.42;
const TREE_WHOLE_EPSILON = 0.015;
// Above this many strokes in one component, skip computing proximity for pairs
// whose bounding boxes are farther apart than SEGMENT_PRUNE_GAP_NORM * radius.
// Bbox gap lower-bounds closest-point distance, and a pair that far apart cannot
// reach MERGE_SCORE_FLOOR (even the center-sigil shortcut needs the centers
// within 0.54 * radius), so the pruned edges would never have merged.
const SEGMENT_ALLPAIRS_CAP = 48;
const SEGMENT_PRUNE_GAP_NORM = 0.6;

interface DecompositionNode {
	id: string;
	strokes: CleanedStroke[];
	children: DecompositionNode[];
	proximityScore: number;
}

interface TreeSelection {
	value: number;
	groups: CleanedStroke[][];
}

function endpointDistance(a: Stroke, b: Stroke): number {
	const endpointsA = [a.points[0], a.points[a.points.length - 1]].filter(Boolean);
	const endpointsB = [b.points[0], b.points[b.points.length - 1]].filter(Boolean);
	let best = Infinity;
	for (const pointA of endpointsA) {
		for (const pointB of endpointsB) {
			best = Math.min(best, distance(pointA, pointB));
		}
	}
	return best;
}

function sampledStrokePoints(stroke: Stroke): Stroke['points'] {
	const points = stroke.points ?? [];
	if (points.length <= 28) {
		return points;
	}

	const stride = Math.ceil(points.length / 28);
	return points.filter((_, index) => index % stride === 0);
}

function pointDistance(a: Stroke, b: Stroke): number {
	const pointsA = sampledStrokePoints(a);
	const pointsB = sampledStrokePoints(b);
	let best = Infinity;
	for (const pointA of pointsA) {
		for (const pointB of pointsB) {
			best = Math.min(best, distance(pointA, pointB));
		}
	}
	return best;
}

function boundsGap(a: CleanedStroke, b: CleanedStroke): number {
	const dx = Math.max(
		0,
		Math.max(
			a.metrics.bounds.minX - b.metrics.bounds.maxX,
			b.metrics.bounds.minX - a.metrics.bounds.maxX
		)
	);
	const dy = Math.max(
		0,
		Math.max(
			a.metrics.bounds.minY - b.metrics.bounds.maxY,
			b.metrics.bounds.minY - a.metrics.bounds.maxY
		)
	);
	return Math.hypot(dx, dy);
}

function strokePairProximity(
	a: CleanedStroke,
	b: CleanedStroke,
	ring: RingInfo,
	config: AppConfig
) {
	const radius = Math.max(1, ring.radius);
	const aCenter = centerOfBounds(a.metrics.bounds);
	const bCenter = centerOfBounds(b.metrics.bounds);
	const aPolar = summarizePolar(aCenter, ring, config);
	const bPolar = summarizePolar(bCenter, ring, config);
	const sameLayer = aPolar.layer === bPolar.layer || aPolar.nearBoundary || bPolar.nearBoundary;
	const angleDifference = angularDifference(aPolar.angleDeg, bPolar.angleDeg);
	const centerDistanceNorm = distance(aCenter, bCenter) / radius;
	const bboxDistanceNorm = boundsGap(a, b) / radius;
	const pointDistanceNorm = pointDistance(a, b) / radius;
	const centerCompatible =
		Math.min(aPolar.radiusNorm, bPolar.radiusNorm) <= config.layers.centerMax ||
		angleDifference <= 30;
	const bothCenter =
		Math.max(aPolar.radiusNorm, bPolar.radiusNorm) <=
		config.layers.centerMax + config.layers.boundaryTolerance * 1.5;
	const centerSigilCompatible = bothCenter && centerDistanceNorm <= 0.54;
	const paddedOverlap = boundsOverlap(
		expandBounds(a.metrics.bounds, radius * BBOX_PADDING_NORM),
		expandBounds(b.metrics.bounds, radius * BBOX_PADDING_NORM)
	);
	const connected =
		paddedOverlap ||
		pointDistanceNorm <= ENDPOINT_DISTANCE_NORM ||
		centerSigilCompatible ||
		(sameLayer && centerDistanceNorm <= CENTER_DISTANCE_NORM * 1.2 && centerCompatible);
	const weightedScore = clamp(
		clamp(1 - bboxDistanceNorm / 0.13) * 0.28 +
			clamp(1 - pointDistanceNorm / 0.12) * 0.34 +
			clamp(1 - centerDistanceNorm / 0.27) * 0.2 +
			(sameLayer ? 0.11 : 0.03) +
			clamp(1 - angleDifference / 42) * 0.07
	);
	const score = Math.max(
		weightedScore,
		paddedOverlap ? 0.72 : 0,
		pointDistanceNorm <= ENDPOINT_DISTANCE_NORM ? 0.68 : 0,
		centerSigilCompatible ? 0.6 : 0
	);

	return {
		connected,
		score
	};
}

function shouldGroup(a: CleanedStroke, b: CleanedStroke, ring: RingInfo): boolean {
	const padding = ring.radius * BBOX_PADDING_NORM;
	const aBounds = expandBounds(a.metrics.bounds, padding);
	const bBounds = expandBounds(b.metrics.bounds, padding);
	const centersClose =
		distance(centerOfBounds(a.metrics.bounds), centerOfBounds(b.metrics.bounds)) <=
		ring.radius * CENTER_DISTANCE_NORM;
	const endpointsClose = endpointDistance(a, b) <= ring.radius * ENDPOINT_DISTANCE_NORM;
	return boundsOverlap(aBounds, bBounds) || centersClose || endpointsClose;
}

function maxTemplateStrokeCount(dictionary: Dictionary): number {
	const counts = [...dictionary.sigils, ...dictionary.signs].map(
		(entry) => entry.strokeTemplate?.strokes?.length ?? 0
	);
	return Math.max(8, ...counts) * 2 + 4;
}

function classifyRadialFacing(directedAngle: number, radialAngle: number): RadialFacing {
	const outward = angularDifference(directedAngle, radialAngle);
	const inward = angularDifference(directedAngle, radialAngle + 180);
	const counterclockwise = angularDifference(directedAngle, radialAngle + 90);
	const clockwise = angularDifference(directedAngle, radialAngle - 90);
	const best = Math.min(outward, inward, counterclockwise, clockwise);

	if (best > 48) {
		return 'unclear';
	}
	if (best === outward) {
		return 'outward';
	}
	if (best === inward) {
		return 'inward';
	}
	if (best === counterclockwise) {
		return 'counterclockwise';
	}
	return 'clockwise';
}

function buildCandidate(
	strokes: CleanedStroke[],
	index: number,
	ring: RingInfo,
	config: AppConfig
): SymbolCandidate {
	const points = allPoints(strokes);
	const bounds = boundsForStrokes(strokes);
	const center = centerOfBounds(bounds);
	const polar = summarizePolar(center, ring, config);
	const length = strokes.reduce((sum, stroke) => sum + strokeLength(stroke), 0);
	const size = Math.max(bounds.width, bounds.height);
	const sizeNorm = size / Math.max(1, ring.radius * 2);
	const lengthNorm = length / Math.max(1, Math.PI * 2 * ring.radius);
	const orientationDeg = dominantAxisOrientationDeg(points);
	const directedOrientationDeg = directedStrokeAngle(strokes);
	const radialFacing = classifyRadialFacing(directedOrientationDeg, polar.angleDeg);
	const compactPerimeter = Math.max(1, (bounds.width + bounds.height) * 2);
	const overdrawAmount = clamp(length / compactPerimeter - 0.72, 0, 1);
	const closedness = endpointClosedness(strokes, Math.max(1, size));

	return {
		candidateId: `c${index + 1}`,
		strokeIds: strokes.map((stroke) => stroke.id),
		rawStrokeCount: strokes.length,
		cleanedStrokeCount: strokes.length,
		bounds,
		center,
		radiusNorm: polar.radiusNorm,
		angleDeg: polar.angleDeg,
		layer: polar.layer,
		nearBoundary: polar.nearBoundary,
		sizeNorm,
		lengthNorm,
		orientationDeg,
		directedOrientationDeg,
		radialFacing,
		closedness,
		overdrawAmount,
		neatness: clamp(0.92 - overdrawAmount * 0.28 - Math.max(0, strokes.length - 4) * 0.035),
		strokes
	};
}

function connectedComponents(strokes: CleanedStroke[], ring: RingInfo, config: AppConfig) {
	const adjacency = new Map<string, CleanedStroke[]>();
	for (const stroke of strokes) {
		adjacency.set(stroke.id, []);
	}

	for (let a = 0; a < strokes.length; a += 1) {
		for (let b = a + 1; b < strokes.length; b += 1) {
			const proximity = strokePairProximity(strokes[a], strokes[b], ring, config);
			if (!proximity.connected || proximity.score < MERGE_SCORE_FLOOR) {
				continue;
			}
			adjacency.get(strokes[a].id)!.push(strokes[b]);
			adjacency.get(strokes[b].id)!.push(strokes[a]);
		}
	}

	const visited = new Set<string>();
	const components: CleanedStroke[][] = [];
	for (const stroke of strokes) {
		if (visited.has(stroke.id)) {
			continue;
		}
		const component: CleanedStroke[] = [];
		const queue = [stroke];
		visited.add(stroke.id);
		while (queue.length) {
			const current = queue.shift()!;
			component.push(current);
			for (const next of adjacency.get(current.id) ?? []) {
				if (visited.has(next.id)) {
					continue;
				}
				visited.add(next.id);
				queue.push(next);
			}
		}
		components.push(component);
	}

	return components;
}

interface MergeEdge {
	a: number;
	b: number;
	score: number;
}

// Single-linkage agglomerative clustering via union-find. Sorting the leaf
// pairs by descending proximity and merging with union-find reproduces the same
// merge-forest topology as repeatedly merging the closest pair, but without the
// O(n^3) all-pairs rescan after every merge. Each connected component collapses
// to one dendrogram root because the edges that formed the component all clear
// MERGE_SCORE_FLOOR and are therefore present here.
function buildMergeForest(
	component: CleanedStroke[],
	ring: RingInfo,
	config: AppConfig,
	nextId: { value: number }
): DecompositionNode[] {
	const leaves: DecompositionNode[] = component.map((stroke) => ({
		id: `n${nextId.value++}`,
		strokes: [stroke],
		children: [],
		proximityScore: 1
	}));

	const count = leaves.length;
	if (count <= 1) {
		return leaves;
	}

	const usePruning = count > SEGMENT_ALLPAIRS_CAP;
	const pruneGap = ring.radius * SEGMENT_PRUNE_GAP_NORM;
	const edges: MergeEdge[] = [];
	for (let a = 0; a < count; a += 1) {
		for (let b = a + 1; b < count; b += 1) {
			if (usePruning && boundsGap(component[a], component[b]) > pruneGap) {
				continue;
			}
			const score = strokePairProximity(component[a], component[b], ring, config).score;
			if (score >= MERGE_SCORE_FLOOR) {
				edges.push({ a, b, score });
			}
		}
	}

	edges.sort((x, y) => y.score - x.score);

	const parent = leaves.map((_, index) => index);
	const rootNode = [...leaves];
	const find = (x: number): number => {
		while (parent[x] !== x) {
			parent[x] = parent[parent[x]];
			x = parent[x];
		}
		return x;
	};

	for (const edge of edges) {
		const rootA = find(edge.a);
		const rootB = find(edge.b);
		if (rootA === rootB) {
			continue;
		}
		const first = rootNode[rootA];
		const second = rootNode[rootB];
		rootNode[rootA] = {
			id: `n${nextId.value++}`,
			strokes: [...first.strokes, ...second.strokes],
			children: [first, second],
			proximityScore: edge.score
		};
		parent[rootB] = rootA;
	}

	const roots: DecompositionNode[] = [];
	const seen = new Set<number>();
	for (let index = 0; index < count; index += 1) {
		const root = find(index);
		if (seen.has(root)) {
			continue;
		}
		seen.add(root);
		roots.push(rootNode[root]);
	}

	return roots;
}

function canScoreWholeNode(
	node: DecompositionNode,
	ring: RingInfo,
	config: AppConfig,
	maxStrokeCount: number
): boolean {
	if (node.strokes.length > maxStrokeCount) {
		return false;
	}
	const candidate = buildCandidate(node.strokes, 0, ring, config);
	return candidate.sizeNorm <= MAX_SYMBOL_SIZE_NORM;
}

function selectTreeCut(
	node: DecompositionNode,
	ring: RingInfo,
	config: AppConfig,
	maxStrokeCount: number,
	scoreCut: DecompositionScorer
): TreeSelection {
	const groupPenalty = config.recognition.groupPenalty ?? 0.45;
	const wholeCandidate = buildCandidate(node.strokes, 0, ring, config);
	const wholeValue = canScoreWholeNode(node, ring, config, maxStrokeCount)
		? Math.max(scoreCut(wholeCandidate) - groupPenalty, 0)
		: 0;

	if (!node.children.length) {
		return {
			value: wholeValue,
			groups: [node.strokes]
		};
	}

	const childSelections = node.children.map((child) =>
		selectTreeCut(child, ring, config, maxStrokeCount, scoreCut)
	);
	const childValue = childSelections.reduce((sum, selection) => sum + selection.value, 0);
	const childGroups = childSelections.flatMap((selection) => selection.groups);

	if (wholeValue > childValue + TREE_WHOLE_EPSILON) {
		return {
			value: wholeValue,
			groups: [node.strokes]
		};
	}

	return {
		value: childValue,
		groups: childGroups
	};
}

function fallbackCandidates(
	strokes: CleanedStroke[],
	classifications: StrokeClassification[],
	ring: RingInfo,
	config: AppConfig
): SymbolCandidate[] {
	const classificationById = new Map(
		classifications.map((classification) => [classification.strokeId, classification])
	);
	const seedStrokes = strokes.filter((stroke) => classificationById.get(stroke.id)?.usedByParser);
	const joinableStrokes = strokes.filter(
		(stroke) => classificationById.get(stroke.id)?.canJoinSymbol
	);
	const visited = new Set<string>();
	const groups: CleanedStroke[][] = [];

	for (const stroke of seedStrokes) {
		if (visited.has(stroke.id)) {
			continue;
		}

		const group: CleanedStroke[] = [];
		const queue: CleanedStroke[] = [stroke];
		visited.add(stroke.id);

		while (queue.length) {
			const current = queue.shift()!;
			group.push(current);

			for (const other of joinableStrokes) {
				if (visited.has(other.id)) {
					continue;
				}
				if (shouldGroup(current, other, ring)) {
					visited.add(other.id);
					queue.push(other);
				}
			}
		}

		groups.push(group);
	}

	return groups
		.map((group, index) => buildCandidate(group, index, ring, config))
		.filter((candidate) => candidate.sizeNorm <= MAX_SYMBOL_SIZE_NORM);
}

export function buildSymbolCandidates(
	strokes: CleanedStroke[],
	classifications: StrokeClassification[],
	ring: RingInfo,
	config: AppConfig,
	dictionary?: Dictionary,
	recognitionExamples: RecognitionExample[] = []
): SymbolCandidate[] {
	if (!ring.found) {
		return [];
	}

	if (!dictionary) {
		return fallbackCandidates(strokes, classifications, ring, config);
	}

	if (!config.recognition.recognitionGuidedDecomposition) {
		return fallbackCandidates(strokes, classifications, ring, config);
	}

	const classificationById = new Map(
		classifications.map((classification) => [classification.strokeId, classification])
	);
	const symbolStrokes = strokes.filter(
		(stroke) =>
			classificationById.get(stroke.id)?.canJoinSymbol ||
			classificationById.get(stroke.id)?.usedByParser
	);

	const nextId = { value: 1 };
	const maxStrokeCount = maxTemplateStrokeCount(dictionary);
	const scoreCut = createDecompositionScorer(dictionary, config, recognitionExamples);
	const groups = connectedComponents(symbolStrokes, ring, config).flatMap((component) =>
		buildMergeForest(component, ring, config, nextId).flatMap(
			(node) => selectTreeCut(node, ring, config, maxStrokeCount, scoreCut).groups
		)
	);

	return groups
		.map((group, index) => buildCandidate(group, index, ring, config))
		.filter((candidate) => candidate.sizeNorm <= MAX_SYMBOL_SIZE_NORM);
}
