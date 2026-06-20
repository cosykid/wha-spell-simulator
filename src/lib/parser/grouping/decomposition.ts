import type { AppConfig, CleanedStroke, RingInfo, SymbolCandidate } from '../../types.js';
import { createDecompositionScorer, type DecompositionScorer } from '../recognition/index.js';
import type { RecognitionExample } from '../shape-matcher/index.js';
import {
	MAX_SYMBOL_SIZE_NORM,
	MERGE_SCORE_FLOOR,
	SEGMENT_ALLPAIRS_CAP,
	SEGMENT_PRUNE_GAP_NORM,
	TREE_WHOLE_EPSILON
} from './constants.js';
import { buildCandidate, maxTemplateStrokeCount } from './candidate.js';
import {
	boundsGap,
	canMergeByProximity,
	groupsTouch,
	shouldGroup,
	strokePairProximity
} from './proximity.js';
import type { DecompositionNode, MergeEdge, StrokeClassification, TreeSelection } from './types.js';
import type { Dictionary } from '../../types.js';

/** Basic connected components over strokes that are close enough to form symbols. */
export function connectedComponents(strokes: CleanedStroke[], ring: RingInfo, config: AppConfig) {
	const adjacency = new Map<string, CleanedStroke[]>();
	for (const stroke of strokes) {
		adjacency.set(stroke.id, []);
	}

	for (let a = 0; a < strokes.length; a += 1) {
		for (let b = a + 1; b < strokes.length; b += 1) {
			if (!canMergeByProximity(strokes[a], strokes[b], ring, config)) {
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

/** Builds a union-find merge forest for one connected component. */
export function buildMergeForest(
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

/** Chooses the best recognition-guided tree cut under one merge node. */
export function selectTreeCut(
	node: DecompositionNode,
	ring: RingInfo,
	config: AppConfig,
	maxStrokeCount: number,
	scoreCut: DecompositionScorer
): TreeSelection {
	const groupPenalty = config.recognition.groupPenalty ?? 0.45;
	const wholeCandidate = buildCandidate(node.strokes, 0, ring, config);
	const canScoreWhole = canScoreWholeNode(node, ring, config, maxStrokeCount);
	const wholeValue = canScoreWhole ? Math.max(scoreCut(wholeCandidate) - groupPenalty, 0) : 0;

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

	if (wholeValue <= 0 && childValue <= 0) {
		return {
			value: childValue,
			groups: childGroups
		};
	}

	if (canScoreWhole && wholeValue + TREE_WHOLE_EPSILON >= childValue) {
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

/** Groups candidates using only geometric proximity. */
export function fallbackCandidates(
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
				if (shouldGroup(current, other, ring, config)) {
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

function shouldMergeFragmentGroups(
	a: CleanedStroke[],
	b: CleanedStroke[],
	ring: RingInfo,
	config: AppConfig
): boolean {
	if (!groupsTouch(a, b, ring)) {
		return false;
	}

	const mergedCandidate = buildCandidate([...a, ...b], 0, ring, config);
	if (mergedCandidate.sizeNorm > MAX_SYMBOL_SIZE_NORM) {
		return false;
	}

	return true;
}

/** Merges tiny fragment groups that are likely parts of one intended symbol. */
export function mergeFragmentGroups(
	groups: CleanedStroke[][],
	ring: RingInfo,
	config: AppConfig
): CleanedStroke[][] {
	const merged = groups.map((group) => [...group]);
	let changed = true;

	while (changed) {
		changed = false;
		for (let a = 0; a < merged.length; a += 1) {
			for (let b = a + 1; b < merged.length; b += 1) {
				if (!shouldMergeFragmentGroups(merged[a], merged[b], ring, config)) {
					continue;
				}
				merged[a] = [...merged[a], ...merged[b]];
				merged.splice(b, 1);
				changed = true;
				break;
			}
			if (changed) {
				break;
			}
		}
	}

	return merged;
}

/** Performs recognition-guided decomposition and candidate construction. */
export function decomposeWithRecognition(
	strokes: CleanedStroke[],
	classifications: StrokeClassification[],
	ring: RingInfo,
	config: AppConfig,
	dictionary: Dictionary,
	recognitionExamples: RecognitionExample[]
): SymbolCandidate[] {
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

	return mergeFragmentGroups(groups, ring, config)
		.map((group, index) => buildCandidate(group, index, ring, config))
		.filter((candidate) => candidate.sizeNorm <= MAX_SYMBOL_SIZE_NORM);
}
