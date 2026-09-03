/**
 * @file Strokes to symbol groups.
 *
 * With a dictionary, grouping is a partition search: affinity components are
 * proposed as hypotheses, each hypothesis is valued by wholeness and cohesion,
 * and the best exact cover of each component becomes the candidates. Without
 * one, strokes group by affinity alone.
 */
import { strokeLength } from '../../utils/geometry.js';
import type {
	AppConfig,
	CleanedStroke,
	Dictionary,
	RingInfo,
	SymbolCandidate
} from '../../types.js';
import { createDecompositionScorer, type DecompositionScorer } from '../recognition/index.js';
import type { RecognitionExample } from '../shape-matcher/index.js';
import { affinityMatrix } from './affinity.js';
import { buildCandidate } from './candidate.js';
import { affinityComponents, boundedComponents } from './components.js';
import {
	COMPONENT_AFFINITY_MIN,
	FALLBACK_AFFINITY_MIN,
	LEFTOVER_MAX_SEEDS,
	LEFTOVER_MIN_WHOLENESS,
	MAX_COMPONENT_STROKES,
	MAX_SYMBOL_SIZE_NORM
} from './constants.js';
import { groupValue } from './groupValue.js';
import { HypothesisSet, proposeByAffinity, proposeLeftovers } from './hypotheses.js';
import { bestPartition } from './partition.js';
import type {
	AffinityMatrix,
	ComponentContext,
	GroupHypothesis,
	StrokeClassification,
	ValuedGroup
} from './types.js';

function classificationById(classifications: StrokeClassification[]) {
	return new Map(
		classifications.map((classification) => [classification.strokeId, classification])
	);
}

function componentContext(
	component: number[],
	strokes: CleanedStroke[],
	affinity: AffinityMatrix
): ComponentContext {
	const componentStrokes = component.map((index) => strokes[index]);
	const lengths = componentStrokes.map((stroke) => Math.max(strokeLength(stroke), 1));
	const totalInk = lengths.reduce((sum, length) => sum + length, 0);
	return {
		strokes: componentStrokes,
		affinity: component.map((a) => component.map((b) => affinity[a][b])),
		inkShare: lengths.map((length) => length / totalInk)
	};
}

function partitionComponent(
	component: number[],
	strokes: CleanedStroke[],
	affinity: AffinityMatrix,
	ring: RingInfo,
	config: AppConfig,
	scorer: DecompositionScorer
): number[][] {
	if (component.length === 1 || component.length > MAX_COMPONENT_STROKES) {
		return [component];
	}
	const context = componentContext(component, strokes, affinity);
	const valueOf = (hypothesis: GroupHypothesis): ValuedGroup => {
		const members = hypothesis.members.map((index) => context.strokes[index]);
		const wholeness = scorer(buildCandidate(members, 0, ring, config)).wholeness;
		return {
			...hypothesis,
			wholeness,
			value: groupValue(hypothesis.members, wholeness, context, config)
		};
	};
	const set = new HypothesisSet(context.strokes, ring.radius);
	const valued = proposeByAffinity(set, context).map(valueOf);
	const clean = valued
		.filter((group) => group.wholeness >= LEFTOVER_MIN_WHOLENESS)
		.sort((a, b) => b.wholeness - a.wholeness)
		.slice(0, LEFTOVER_MAX_SEEDS);
	valued.push(...proposeLeftovers(set, clean).map(valueOf));
	return bestPartition(component.length, valued).map((group) =>
		group.members.map((index) => component[index])
	);
}

/** Candidates in drawing order, dropping groups too large to be one symbol. */
function candidatesFromGroups(
	groups: number[][],
	strokes: CleanedStroke[],
	ring: RingInfo,
	config: AppConfig
): SymbolCandidate[] {
	return groups
		.map((group) => [...group].sort((a, b) => a - b))
		.sort((a, b) => a[0] - b[0])
		.map((group, index) =>
			buildCandidate(
				group.map((strokeIndex) => strokes[strokeIndex]),
				index,
				ring,
				config
			)
		)
		.filter((candidate) => candidate.sizeNorm <= MAX_SYMBOL_SIZE_NORM);
}

/** Groups candidates by affinity alone. */
export function fallbackCandidates(
	strokes: CleanedStroke[],
	classifications: StrokeClassification[],
	ring: RingInfo,
	config: AppConfig
): SymbolCandidate[] {
	const byId = classificationById(classifications);
	const joinable = strokes.filter((stroke) => byId.get(stroke.id)?.canJoinSymbol);
	const affinity = affinityMatrix(joinable, ring, config);
	const groups = affinityComponents(
		joinable.map((_, index) => index),
		affinity,
		FALLBACK_AFFINITY_MIN
	).filter((group) => group.some((index) => byId.get(joinable[index].id)?.usedByParser));
	return candidatesFromGroups(groups, joinable, ring, config);
}

/** Groups candidates by recognition-guided partition search. */
export function decomposeWithRecognition(
	strokes: CleanedStroke[],
	classifications: StrokeClassification[],
	ring: RingInfo,
	config: AppConfig,
	dictionary: Dictionary,
	recognitionExamples: RecognitionExample[]
): SymbolCandidate[] {
	const byId = classificationById(classifications);
	const symbolStrokes = strokes.filter(
		(stroke) => byId.get(stroke.id)?.canJoinSymbol || byId.get(stroke.id)?.usedByParser
	);
	const affinity = affinityMatrix(symbolStrokes, ring, config);
	const scorer = createDecompositionScorer(dictionary, config, recognitionExamples);
	const groups = affinityComponents(
		symbolStrokes.map((_, index) => index),
		affinity,
		COMPONENT_AFFINITY_MIN
	)
		.flatMap((component) =>
			boundedComponents(component, affinity, COMPONENT_AFFINITY_MIN, MAX_COMPONENT_STROKES)
		)
		.flatMap((component) =>
			partitionComponent(component, symbolStrokes, affinity, ring, config, scorer)
		);
	return candidatesFromGroups(groups, symbolStrokes, ring, config);
}
