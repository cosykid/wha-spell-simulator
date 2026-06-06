import {
	angularDifference,
	boundsForPoints,
	clamp,
	dominantAxisOrientationDeg,
	normalizeAngleDeg,
	pathLength,
	strokeLength
} from '../utils/geometry.js';
import { recognitionPlanForSymbol } from './signRotation.js';
import {
	buildExamplesFromDictionary,
	recognitionKey,
	scoreRecognitionExample,
	voteNearestExamples,
	type KnnVoteResult,
	type RecognitionExample,
	type ShapeMatcherResult
} from './shapeMatcher.js';
import type {
	AppConfig,
	Dictionary,
	DictionaryEntry,
	RecognitionKind,
	RecognitionStatus,
	RecognizedSymbol,
	Stroke,
	StrokeTemplate,
	SymbolCandidate,
	TemplateMatch
} from '../types.js';

const RECOGNITION_AMBIGUITY_GAP = 0.065;
const SIMPLE_SIGN_STROKE_LIMIT = 6;
const DECOMPOSITION_DOMINANT_SIGIL_SCORE = 0.85;
const SIMPLE_SIGN_MIN_TEMPLATE_COVERAGE = 0.78;
const templateFeatureCache = new WeakMap<StrokeTemplate, TemplateFeatures>();
const dictionaryExampleCache = new WeakMap<Dictionary, RecognitionExample[]>();

interface TemplateFeatures {
	aspectRatio: number;
	elongation: number;
	strokeCount: number;
	orientationDeg: number;
	strokeProfile: number[];
}

interface CandidateFeatures {
	aspectRatio: number;
	elongation: number;
	elongationNorm: number;
	strokeCount: number;
	strokeLengthImbalance: number;
	axisDominance: number;
	strokeProfile: number[];
}

interface StructuralMatch {
	score: number;
	aspectScore: number;
	strokeCountScore: number;
	strokeProfileScore: number;
	axisScore: number;
	candidateAspectRatio: number;
	templateAspectRatio: number;
	candidateStrokeCount: number;
	templateStrokeCount: number;
}

interface ScoredTemplate {
	confidence: number;
	templateMatch: TemplateMatch | null;
	structuralMatch: StructuralMatch | null;
	matcher: ShapeMatcherResult | null;
	knnVoteConfidence: number;
}

interface PrecomputedExampleScore {
	recognitionPlan: ReturnType<typeof recognitionPlanForSymbol>;
	matchFeatures: CandidateFeatures;
	matcher: ShapeMatcherResult;
}

type ScoredEntry = ScoredTemplate & {
	kind: RecognitionKind;
	entry: DictionaryEntry;
	example: RecognitionExample | null;
};

interface RecognitionThresholds {
	minConfidence: number;
	ambiguityGap: number;
	contaminationThreshold: number;
	minTemplateCoverage: number;
	knnK: number;
}

function allowedLayerScore(entry: DictionaryEntry, candidate: SymbolCandidate): number {
	if (candidate.layer === 'any') {
		return 1;
	}
	if (!entry.allowedLayers?.length) {
		return 0.75;
	}
	if (entry.allowedLayers.includes(candidate.layer)) {
		return 1;
	}
	if (candidate.nearBoundary) {
		return 0.72;
	}
	return 0.34;
}

function rangeScore(value: number, min: number, max: number): number {
	if (value < min) {
		return clamp(value / Math.max(0.001, min));
	}
	if (value > max) {
		return clamp(1 - (value - max) / Math.max(0.001, max));
	}
	return 1;
}

function entryStrokeTemplate(entry: DictionaryEntry): StrokeTemplate | null {
	return entry.strokeTemplate ?? null;
}

function recognitionThresholds(config: AppConfig): RecognitionThresholds {
	const recognition = config.recognition ?? {};
	return {
		minConfidence: recognition.minConfidence ?? 0.48,
		ambiguityGap: RECOGNITION_AMBIGUITY_GAP,
		contaminationThreshold: recognition.contaminationThreshold ?? 0.5,
		minTemplateCoverage: recognition.minTemplateCoverage ?? 0.55,
		knnK: recognition.knnK ?? 5
	};
}

function aspectRatio(width: number, height: number): number {
	return Math.max(0.001, width) / Math.max(0.001, height);
}

function rotatedAspectRatio(ratio: number, rotationDeg: number): number {
	const normalized = Math.abs((normalizeAngleDeg(rotationDeg) % 180) - 90);
	const blend = 1 - normalized / 90;
	const logRatio = Math.log(Math.max(0.001, ratio));
	return Math.exp(logRatio * (1 - blend * 2));
}

function aspectCompatibility(
	candidateRatio: number,
	templateRatio: number,
	rotationDeg: number
): number {
	const adjustedCandidateRatio = rotatedAspectRatio(candidateRatio, rotationDeg);
	const distance = Math.abs(Math.log(adjustedCandidateRatio / Math.max(0.001, templateRatio)));
	return clamp(1 - distance / 1.1);
}

function undirectedAngularDifference(a: number, b: number): number {
	const difference = angularDifference(a, b);
	return Math.min(difference, Math.abs(180 - difference));
}

function strokeLengthProfile<T>(
	strokes: T[],
	pointGetter: (stroke: T) => { x: number; y: number }[]
): number[] {
	const lengths = strokes
		.map((stroke) => pathLength(pointGetter(stroke)))
		.filter((length) => length > 0.0001)
		.sort((a, b) => b - a);
	const total = lengths.reduce((sum, length) => sum + length, 0);
	if (!total) {
		return [];
	}
	return lengths.map((length) => length / total);
}

function profileCompatibility(candidateProfile: number[], templateProfile: number[]): number {
	const count = Math.max(candidateProfile.length, templateProfile.length);
	if (!count) {
		return 1;
	}

	let distance = 0;
	for (let index = 0; index < count; index += 1) {
		distance += Math.abs((candidateProfile[index] ?? 0) - (templateProfile[index] ?? 0));
	}
	return clamp(1 - distance / 1.4);
}

function strokeCountCompatibility(candidateCount: number, templateCount: number): number {
	if (!candidateCount || !templateCount) {
		return 0;
	}
	return clamp(
		1 - Math.abs(candidateCount - templateCount) / Math.max(candidateCount, templateCount)
	);
}

function templateFeatures(strokeTemplate: StrokeTemplate): TemplateFeatures {
	const cached = templateFeatureCache.get(strokeTemplate);
	if (cached) {
		return cached;
	}

	const strokes = strokeTemplate?.strokes ?? [];
	const points = strokes.flat();
	const bounds = boundsForPoints(points);
	const width = Math.max(0.001, bounds.width);
	const height = Math.max(0.001, bounds.height);
	const features: TemplateFeatures = {
		aspectRatio: aspectRatio(width, height),
		elongation: Math.max(width, height) / Math.max(0.001, Math.min(width, height)),
		strokeCount: strokes.length,
		orientationDeg: dominantAxisOrientationDeg(points),
		strokeProfile: strokeLengthProfile(strokes, (stroke) => stroke)
	};
	templateFeatureCache.set(strokeTemplate, features);
	return features;
}

function candidateFeatures(candidate: SymbolCandidate): CandidateFeatures {
	const bounds = candidate.bounds;
	const width = Math.max(1, bounds.width);
	const height = Math.max(1, bounds.height);
	const elongation = Math.max(width, height) / Math.max(1, Math.min(width, height));
	const strokeProfiles = candidate.strokes
		.map((stroke) => {
			const length = strokeLength(stroke);
			return { length };
		})
		.sort((a, b) => b.length - a.length);
	const totalStrokeLength = strokeProfiles.reduce((sum, stroke) => sum + stroke.length, 0);
	const dominantStroke = strokeProfiles[0] ?? { length: 0 };
	const secondaryStroke = strokeProfiles[1] ?? { length: 0 };
	const strokeLengthImbalance =
		strokeProfiles.length > 1
			? (dominantStroke.length - secondaryStroke.length) / Math.max(0.001, totalStrokeLength)
			: 0;
	const elongationNorm = clamp((elongation - 1) / 3);
	const axisDominance = clamp(strokeLengthImbalance * 1.35 + elongationNorm * 0.35);

	return {
		aspectRatio: aspectRatio(width, height),
		elongation,
		elongationNorm,
		strokeCount: candidate.strokes.length,
		strokeLengthImbalance,
		axisDominance,
		strokeProfile: strokeLengthProfile(candidate.strokes, (stroke: Stroke) => stroke.points ?? [])
	};
}

function structuralCompatibility(
	kind: RecognitionKind,
	entry: DictionaryEntry,
	candidate: SymbolCandidate,
	features: CandidateFeatures,
	templateMatch: TemplateMatch
): StructuralMatch {
	const template = templateFeatures(entry.strokeTemplate!);
	const aspectScore = aspectCompatibility(
		features.aspectRatio,
		template.aspectRatio,
		templateMatch.rotationDeg ?? 0
	);
	const overdrawCompatible =
		templateMatch.candidateExplainedRatio >= 0.9 &&
		templateMatch.templateCoveredRatio >= 0.82 &&
		templateMatch.unexplainedInkRatio <= 0.16;
	const rawCountScore = strokeCountCompatibility(features.strokeCount, template.strokeCount);
	const rawProfileScore = profileCompatibility(features.strokeProfile, template.strokeProfile);
	const countScore =
		overdrawCompatible && features.strokeCount > template.strokeCount
			? Math.max(rawCountScore, 0.86)
			: rawCountScore;
	const profileScore =
		overdrawCompatible && features.strokeCount > template.strokeCount
			? Math.max(rawProfileScore, 0.82)
			: rawProfileScore;
	const rotatedCandidateAxis = normalizeAngleDeg(
		candidate.orientationDeg + (templateMatch.rotationDeg ?? 0)
	);
	const axisScore = clamp(
		1 - undirectedAngularDifference(rotatedCandidateAxis, template.orientationDeg) / 90
	);
	const smallSign = kind === 'sign' && template.strokeCount <= SIMPLE_SIGN_STROKE_LIMIT;
	const strokeStructureScore = smallSign
		? countScore * 0.58 + profileScore * 0.42
		: countScore * 0.24 + profileScore * 0.76;
	const score =
		kind === 'sign'
			? strokeStructureScore * 0.68 + aspectScore * 0.2 + axisScore * 0.12
			: aspectScore * 0.54 + profileScore * 0.28 + countScore * 0.18;

	return {
		score: clamp(score),
		aspectScore,
		strokeCountScore: countScore,
		strokeProfileScore: profileScore,
		axisScore,
		candidateAspectRatio: features.aspectRatio,
		templateAspectRatio: template.aspectRatio,
		candidateStrokeCount: features.strokeCount,
		templateStrokeCount: template.strokeCount
	};
}

function isContaminatedMatch(
	candidate: SymbolCandidate,
	best: ScoredEntry | undefined,
	thresholds: RecognitionThresholds
): boolean {
	if (!best?.templateMatch) {
		return false;
	}
	const templateMatch = best.templateMatch;

	const highRiskExtraInk =
		templateMatch.contaminationRisk >= 0.62 &&
		templateMatch.unexplainedInkRatio >= thresholds.contaminationThreshold * 0.68;
	const oversizedWeakMatch =
		candidate.sizeNorm >= 0.42 &&
		templateMatch.unexplainedInkRatio >= thresholds.contaminationThreshold * 0.52 &&
		best.confidence < 0.7;
	const wrongRegionInk =
		templateMatch.forbiddenCellInkRatio >= 0.42 &&
		templateMatch.requiredCellCoverage <= 0.82 &&
		best.confidence < 0.72;
	const excessUnexplainedInk =
		templateMatch.unexplainedInkRatio >= thresholds.contaminationThreshold &&
		templateMatch.templateCoveredRatio >= thresholds.minTemplateCoverage;

	return highRiskExtraInk || oversizedWeakMatch || wrongRegionInk || excessUnexplainedInk;
}

function isMessyMatch(candidate: SymbolCandidate, best: ScoredEntry | undefined): boolean {
	if (!best?.templateMatch) {
		return false;
	}
	const templateMatch = best.templateMatch;

	return (
		candidate.overdrawAmount >= 0.24 ||
		candidate.neatness <= 0.74 ||
		(templateMatch.candidateExplainedRatio >= 0.9 && templateMatch.softDiceScore < 0.74)
	);
}

function recognitionStatus(
	candidate: SymbolCandidate,
	best: ScoredEntry | undefined,
	second: { confidence?: number },
	secondSameKind: { confidence?: number },
	accepted: boolean,
	thresholds: RecognitionThresholds,
	knn: KnnVoteResult
): RecognitionStatus {
	if (!best) {
		return 'unknown';
	}
	if (isContaminatedMatch(candidate, best, thresholds)) {
		return 'contaminated';
	}
	if (
		best.templateMatch &&
		best.templateMatch.templateCoveredRatio < thresholds.minTemplateCoverage
	) {
		return best.confidence >= thresholds.minConfidence * 0.9 ? 'ambiguous' : 'unknown';
	}
	if (knn.tied || (knn.winnerKey && knn.winnerKey !== recognitionKey(best.kind, best.entry.id))) {
		return best.confidence >= thresholds.minConfidence * 0.88 ? 'ambiguous' : 'unknown';
	}
	if (best.structuralMatch && best.structuralMatch.score < 0.42 && best.confidence < 0.7) {
		return 'ambiguous';
	}
	if (!accepted) {
		return 'unknown';
	}

	const competitor = Math.max(second.confidence ?? 0, secondSameKind.confidence ?? 0);
	const bestInk = best.templateMatch;
	const clearInkIdentity =
		!!bestInk &&
		bestInk.inkScore >= 0.92 &&
		bestInk.candidateExplainedRatio >= 0.98 &&
		bestInk.templateCoveredRatio >= 0.98;
	if (!clearInkIdentity && best.confidence - competitor < thresholds.ambiguityGap) {
		return 'ambiguous';
	}
	if (isMessyMatch(candidate, best)) {
		return 'valid_messy';
	}
	return 'valid';
}

function scoreByStrokeTemplate(
	kind: RecognitionKind,
	entry: DictionaryEntry,
	example: RecognitionExample,
	candidate: SymbolCandidate,
	features: CandidateFeatures,
	knn: KnnVoteResult,
	precomputed?: PrecomputedExampleScore
): ScoredTemplate {
	const layerScore = allowedLayerScore(entry, candidate);
	const strokeTemplate = entryStrokeTemplate(entry);

	if (!strokeTemplate?.strokes?.length) {
		return {
			confidence: 0,
			templateMatch: null,
			structuralMatch: null,
			matcher: null,
			knnVoteConfidence: 0
		};
	}

	const recognitionPlan =
		precomputed?.recognitionPlan ?? recognitionPlanForSymbol(kind, entry, candidate);
	const matchFeatures =
		precomputed?.matchFeatures ??
		(kind === 'sign' ? candidateFeatures(recognitionPlan.candidate) : features);
	const matcher =
		precomputed?.matcher ??
		scoreRecognitionExample(recognitionPlan.candidate.strokes, example, recognitionPlan.options);
	const voteKey = recognitionKey(kind, entry.id);
	const knnVoteConfidence =
		!knn.tied && knn.winnerKey === voteKey ? knn.voteConfidence : (knn.votes[voteKey] ?? 0) * 0.35;
	const matcherConfidence = clamp(
		matcher.pScore * 0.45 + matcher.chamferScore * 0.35 + knnVoteConfidence * 0.2
	);
	const rawTemplateMatch: TemplateMatch = {
		available: matcher.available,
		confidence: matcherConfidence,
		rotationDeg: matcher.rotationDeg,
		recognitionRotationDeg: matcher.recognitionRotationDeg,
		$pDistance: matcher.$pDistance,
		pScore: matcher.pScore,
		chamferDistance: matcher.chamferDistance,
		chamferScore: matcher.chamferScore,
		knnVoteConfidence,
		inkScore: matcher.inkScore,
		softDiceScore: matcher.softDiceScore,
		candidateExplainedRatio: matcher.candidateExplainedRatio,
		templateCoveredRatio: matcher.templateCoveredRatio,
		unexplainedInkRatio: matcher.unexplainedInkRatio,
		missingInkRatio: matcher.missingInkRatio,
		contaminationRisk: matcher.contaminationRisk,
		requiredCellCoverage: matcher.templateCoveredRatio,
		forbiddenCellInkRatio: matcher.unexplainedInkRatio,
		regionScore: clamp(matcher.templateCoveredRatio * 0.65 + matcher.candidateExplainedRatio * 0.35)
	};
	const templateMatch: TemplateMatch = {
		...rawTemplateMatch,
		rotationDeg: normalizeAngleDeg(
			recognitionPlan.baseRotationDeg + (rawTemplateMatch.rotationDeg ?? 0)
		),
		recognitionRotationDeg: normalizeAngleDeg(
			recognitionPlan.baseRotationDeg +
				(rawTemplateMatch.recognitionRotationDeg ?? rawTemplateMatch.rotationDeg ?? 0)
		)
	};
	const structuralMatch = structuralCompatibility(
		kind,
		entry,
		recognitionPlan.candidate,
		matchFeatures,
		rawTemplateMatch
	);
	const sizeScore = rangeScore(candidate.sizeNorm, 0.045, 0.46);
	const simpleSignStructureMultiplier =
		kind === 'sign' && structuralMatch.templateStrokeCount <= SIMPLE_SIGN_STROKE_LIMIT
			? 0.42 + structuralMatch.strokeCountScore * 0.58
			: 1;
	const simpleSignIncompleteCap =
		kind === 'sign' &&
		structuralMatch.templateStrokeCount <= SIMPLE_SIGN_STROKE_LIMIT &&
		templateMatch.templateCoveredRatio < SIMPLE_SIGN_MIN_TEMPLATE_COVERAGE
			? 0.44
			: 1;
	const grossStructureMismatchCap =
		structuralMatch.score < 0.18 && templateMatch.templateCoveredRatio < 0.5 ? 0.44 : 1;
	const contextualScore =
		templateMatch.confidence * 0.74 +
		structuralMatch.score * 0.08 +
		layerScore * 0.09 +
		sizeScore * 0.04 +
		candidate.neatness * 0.05;
	const contextLiftCap = templateMatch.confidence + 0.04;
	return {
		confidence: Math.min(
			clamp(Math.min(contextualScore, contextLiftCap) * simpleSignStructureMultiplier),
			simpleSignIncompleteCap,
			grossStructureMismatchCap
		),
		templateMatch,
		structuralMatch,
		matcher,
		knnVoteConfidence
	};
}

function publicCandidate(candidate: SymbolCandidate) {
	return {
		candidateId: candidate.candidateId,
		strokeIds: candidate.strokeIds,
		rawStrokeCount: candidate.rawStrokeCount,
		layer: candidate.layer,
		nearBoundary: candidate.nearBoundary,
		radiusNorm: candidate.radiusNorm,
		angleDeg: candidate.angleDeg,
		sizeNorm: candidate.sizeNorm,
		lengthNorm: candidate.lengthNorm,
		orientationDeg: candidate.orientationDeg,
		directedOrientationDeg: candidate.directedOrientationDeg,
		radialFacing: candidate.radialFacing,
		overdrawAmount: candidate.overdrawAmount,
		neatness: candidate.neatness
	};
}

function recognitionExamplesFor(
	dictionary: Dictionary,
	extraExamples: RecognitionExample[] = []
): RecognitionExample[] {
	const baseExamples = (() => {
		const cached = dictionaryExampleCache.get(dictionary);
		if (cached) {
			return cached;
		}
		const built = buildExamplesFromDictionary(dictionary);
		dictionaryExampleCache.set(dictionary, built);
		return built;
	})();

	if (!extraExamples.length) {
		return baseExamples;
	}

	const examples = new Map<string, RecognitionExample>();
	for (const example of baseExamples) {
		examples.set(example.id, example);
	}
	for (const example of extraExamples) {
		examples.set(example.id, example);
	}
	return [...examples.values()];
}

export interface DecompositionScorer {
	(candidate: SymbolCandidate): number;
}

// Lightweight scorer for the decomposition tree-cut. It only runs the $P +
// chamfer shape matcher (the directScore that scoreRecognitionExample exposes
// as `confidence`) and deliberately skips kNN voting, structural blending, and
// status logic. Those richer signals are reserved for the final
// recognizeCandidates pass over the chosen groups, so scoring a tree node stays
// cheap. Sigils are scored first; once one clears the dominant threshold, sign
// scoring is skipped for that node.
export function createDecompositionScorer(
	dictionary: Dictionary,
	config: AppConfig,
	recognitionExamples: RecognitionExample[] = []
): DecompositionScorer {
	void config;
	const allExamples = recognitionExamplesFor(dictionary, recognitionExamples);
	const examplesByKey = new Map<string, RecognitionExample[]>();
	for (const example of allExamples) {
		const key = recognitionKey(example.kind, example.symbolId);
		examplesByKey.set(key, [...(examplesByKey.get(key) ?? []), example]);
	}

	type EntryGroup = {
		kind: RecognitionKind;
		entry: DictionaryEntry;
		examples: RecognitionExample[];
	};
	const sigilEntries: EntryGroup[] = dictionary.sigils.flatMap((entry) => {
		const examples = examplesByKey.get(recognitionKey('sigil', entry.id)) ?? [];
		return examples.length ? [{ kind: 'sigil' as const, entry, examples }] : [];
	});
	const signEntries: EntryGroup[] = dictionary.signs.flatMap((entry) => {
		const examples = examplesByKey.get(recognitionKey('sign', entry.id)) ?? [];
		return examples.length ? [{ kind: 'sign' as const, entry, examples }] : [];
	});

	const bestEntryScore = (group: EntryGroup, candidate: SymbolCandidate): number => {
		const plan = recognitionPlanForSymbol(group.kind, group.entry, candidate);
		let best = 0;
		for (const example of group.examples) {
			const matcher = scoreRecognitionExample(plan.candidate.strokes, example, plan.options);
			if (matcher.confidence > best) {
				best = matcher.confidence;
			}
		}
		return best;
	};

	return (candidate: SymbolCandidate): number => {
		let best = 0;
		for (const group of sigilEntries) {
			const score = bestEntryScore(group, candidate);
			if (score > best) {
				best = score;
			}
		}
		if (best >= DECOMPOSITION_DOMINANT_SIGIL_SCORE) {
			return best;
		}
		for (const group of signEntries) {
			const score = bestEntryScore(group, candidate);
			if (score > best) {
				best = score;
			}
		}
		return best;
	};
}

// Recognition scores each grouped symbol candidate against every dictionary
// sigil and sign:
// 1. Extract candidate geometry such as aspect ratio, elongation, stroke count,
//    stroke-length profile, and neatness.
// 2. For signs, rotate the candidate into the bottom-of-ring canonical frame so
//    template matching can compare shape while preserving the original
//    ring-relative orientation as spell meaning.
// 3. Score the candidate against dictionary/user examples with $P point-cloud
//    distance, chamfer distance maps, and kNN voting over nearest examples.
// 4. Blend matcher score with structural compatibility, layer fit, size fit,
//    and neatness, then cap obvious incomplete or contaminated matches.
// 5. Sort all dictionary matches, decide whether the best score is accepted,
//    ambiguous, contaminated, messy-valid, or unknown, and keep the top matches
//    only in diagnostics.
export function recognizeCandidates(
	candidates: SymbolCandidate[],
	dictionary: Dictionary,
	config: AppConfig,
	recognitionExamples: RecognitionExample[] = []
): RecognizedSymbol[] {
	const allExamples = recognitionExamplesFor(dictionary, recognitionExamples);
	const examplesByKey = new Map<string, RecognitionExample[]>();
	for (const example of allExamples) {
		const key = recognitionKey(example.kind, example.symbolId);
		examplesByKey.set(key, [...(examplesByKey.get(key) ?? []), example]);
	}
	const entryByKey = new Map<string, { kind: RecognitionKind; entry: DictionaryEntry }>([
		...dictionary.sigils.map(
			(entry) => [recognitionKey('sigil', entry.id), { kind: 'sigil' as const, entry }] as const
		),
		...dictionary.signs.map(
			(entry) => [recognitionKey('sign', entry.id), { kind: 'sign' as const, entry }] as const
		)
	]);
	const entries: Array<{
		kind: RecognitionKind;
		entry: DictionaryEntry;
		examples: RecognitionExample[];
	}> = [
		...dictionary.sigils.flatMap((entry) => {
			const examples = examplesByKey.get(recognitionKey('sigil', entry.id)) ?? [];
			return examples.length ? [{ kind: 'sigil' as const, entry, examples }] : [];
		}),
		...dictionary.signs.flatMap((entry) => {
			const examples = examplesByKey.get(recognitionKey('sign', entry.id)) ?? [];
			return examples.length ? [{ kind: 'sign' as const, entry, examples }] : [];
		})
	];

	return candidates.map((candidate) => {
		const thresholds = recognitionThresholds(config);
		const features = candidateFeatures(candidate);
		const scoreCache = new Map<string, PrecomputedExampleScore>();
		const scoreExample = (
			kind: RecognitionKind,
			entry: DictionaryEntry,
			example: RecognitionExample
		): PrecomputedExampleScore => {
			const cached = scoreCache.get(example.id);
			if (cached) {
				return cached;
			}
			const recognitionPlan = recognitionPlanForSymbol(kind, entry, candidate);
			const matchFeatures =
				kind === 'sign' ? candidateFeatures(recognitionPlan.candidate) : features;
			const matcher = scoreRecognitionExample(
				recognitionPlan.candidate.strokes,
				example,
				recognitionPlan.options
			);
			const score = { recognitionPlan, matchFeatures, matcher };
			scoreCache.set(example.id, score);
			return score;
		};
		const nearestExampleMatches = allExamples.flatMap((example) => {
			const entryInfo = entryByKey.get(recognitionKey(example.kind, example.symbolId));
			if (!entryInfo) {
				return [];
			}
			const scoredExample = scoreExample(entryInfo.kind, entryInfo.entry, example);
			return [
				{
					example,
					match: scoredExample.matcher
				}
			];
		});
		const knn = voteNearestExamples(nearestExampleMatches, thresholds.knnK);
		const scored: ScoredEntry[] = entries
			.map(({ kind, entry, examples }) => {
				const scoredExamples = examples
					.map((example) => ({
						example,
						score: scoreByStrokeTemplate(
							kind,
							entry,
							example,
							candidate,
							features,
							knn,
							scoreExample(kind, entry, example)
						)
					}))
					.sort((a, b) => b.score.confidence - a.score.confidence);
				const bestExample = scoredExamples[0];
				return {
					kind,
					entry,
					example: bestExample?.example ?? null,
					...(bestExample?.score ?? {
						confidence: 0,
						templateMatch: null,
						structuralMatch: null,
						matcher: null,
						knnVoteConfidence: 0
					})
				};
			})
			.sort((a, b) => b.confidence - a.confidence);

		const best = scored[0];
		const second = scored[1] ?? { confidence: 0 };
		const secondSameKind = scored.find(
			(score) => score.kind === best?.kind && score.entry.id !== best?.entry.id
		) ?? {
			confidence: 0
		};
		const acceptedByConfidence = Boolean(best && best.confidence >= thresholds.minConfidence);
		const acceptedByInk = Boolean(
			best?.templateMatch &&
			best.templateMatch.unexplainedInkRatio <= thresholds.contaminationThreshold &&
			best.templateMatch.templateCoveredRatio >= thresholds.minTemplateCoverage
		);
		const acceptedByKnn = Boolean(
			best && !knn.tied && knn.winnerKey === recognitionKey(best.kind, best.entry.id)
		);
		const status = recognitionStatus(
			candidate,
			best,
			second,
			secondSameKind,
			acceptedByConfidence && acceptedByInk && acceptedByKnn,
			thresholds,
			knn
		);
		const accepted = acceptedByConfidence && (status === 'valid' || status === 'valid_messy');
		const bestTemplateMatch = best?.templateMatch ?? null;
		const bestStructuralMatch = best?.structuralMatch ?? null;
		const topMatches = scored.slice(0, 3).map((score) => ({
			kind: score.kind,
			id: score.entry.id,
			confidence: score.confidence,
			templateConfidence: score.templateMatch?.confidence ?? 0,
			$pDistance: score.templateMatch?.$pDistance ?? 1,
			chamferDistance: score.templateMatch?.chamferDistance ?? 1,
			knnVoteConfidence: score.knnVoteConfidence,
			inkScore: score.templateMatch?.inkScore ?? 0,
			candidateExplainedRatio: score.templateMatch?.candidateExplainedRatio ?? 0,
			templateCoveredRatio: score.templateMatch?.templateCoveredRatio ?? 0,
			structuralScore: score.structuralMatch?.score ?? 0,
			aspectScore: score.structuralMatch?.aspectScore ?? 0,
			strokeCountScore: score.structuralMatch?.strokeCountScore ?? 0,
			strokeProfileScore: score.structuralMatch?.strokeProfileScore ?? 0,
			rotationDeg: score.templateMatch?.rotationDeg ?? 0,
			recognitionRotationDeg:
				score.templateMatch?.recognitionRotationDeg ?? score.templateMatch?.rotationDeg ?? 0
		}));
		const bestGuess = best
			? {
					kind: best.kind,
					id: best.entry.id,
					confidence: best.confidence
				}
			: null;

		return {
			...publicCandidate(candidate),
			recognized: accepted,
			recognitionStatus: status,
			kind: accepted ? best.kind : 'unknown',
			id: accepted ? best.entry.id : null,
			displayName: accepted ? best.entry.displayName : null,
			element: accepted ? (best.entry.element ?? null) : null,
			semantic: accepted ? (best.entry.semantic ?? null) : null,
			confidence: accepted ? best.confidence : 0,
			shape: {
				strokeCount: features.strokeCount,
				aspectRatio: features.aspectRatio,
				elongation: features.elongation,
				elongationNorm: features.elongationNorm,
				strokeLengthImbalance: features.strokeLengthImbalance,
				axisDominance: features.axisDominance
			},
			diagnostics: {
				bestGuess: accepted ? null : bestGuess,
				recognitionRotationDeg:
					bestTemplateMatch?.recognitionRotationDeg ?? bestTemplateMatch?.rotationDeg ?? 0,
				template: {
					$pDistance: bestTemplateMatch?.$pDistance ?? 1,
					pScore: bestTemplateMatch?.pScore ?? 0,
					chamferDistance: bestTemplateMatch?.chamferDistance ?? 1,
					chamferScore: bestTemplateMatch?.chamferScore ?? 0,
					knnVoteConfidence: bestTemplateMatch?.knnVoteConfidence ?? 0,
					inkScore: bestTemplateMatch?.inkScore ?? 0,
					softDiceScore: bestTemplateMatch?.softDiceScore ?? 0,
					candidateExplainedRatio: bestTemplateMatch?.candidateExplainedRatio ?? 0,
					templateCoveredRatio: bestTemplateMatch?.templateCoveredRatio ?? 0,
					unexplainedInkRatio: bestTemplateMatch?.unexplainedInkRatio ?? 1,
					missingInkRatio: bestTemplateMatch?.missingInkRatio ?? 1,
					contaminationRisk: bestTemplateMatch?.contaminationRisk ?? 0,
					forbiddenCellInkRatio: bestTemplateMatch?.forbiddenCellInkRatio ?? 1
				},
				matcher: {
					$pDistance: bestTemplateMatch?.$pDistance ?? 1,
					chamferDistance: bestTemplateMatch?.chamferDistance ?? 1,
					knnVoteConfidence: bestTemplateMatch?.knnVoteConfidence ?? 0,
					knnVotes: knn.votes,
					nearestExamples: knn.nearestExamples.map((example) => ({
						id: example.id,
						kind: example.kind,
						symbolId: example.symbolId,
						source: example.source,
						distance: example.distance,
						$pDistance: example.$pDistance,
						chamferDistance: example.chamferDistance
					})),
					candidateExplainedRatio: bestTemplateMatch?.candidateExplainedRatio ?? 0,
					templateCoveredRatio: bestTemplateMatch?.templateCoveredRatio ?? 0,
					unexplainedInkRatio: bestTemplateMatch?.unexplainedInkRatio ?? 1
				},
				structure: {
					score: bestStructuralMatch?.score ?? 0,
					aspectScore: bestStructuralMatch?.aspectScore ?? 0,
					strokeCountScore: bestStructuralMatch?.strokeCountScore ?? 0,
					strokeProfileScore: bestStructuralMatch?.strokeProfileScore ?? 0,
					axisScore: bestStructuralMatch?.axisScore ?? 0,
					candidateAspectRatio: bestStructuralMatch?.candidateAspectRatio ?? features.aspectRatio,
					templateAspectRatio: bestStructuralMatch?.templateAspectRatio ?? 1,
					candidateStrokeCount: bestStructuralMatch?.candidateStrokeCount ?? features.strokeCount,
					templateStrokeCount: bestStructuralMatch?.templateStrokeCount ?? 0
				},
				topMatches
			}
		};
	});
}
