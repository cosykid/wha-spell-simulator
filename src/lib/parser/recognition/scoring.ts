import { clamp, normalizeAngleDeg } from '../../utils/geometry.js';
import { candidateContentKey, scopedLruCache } from '../recognitionMemo.js';
import { recognitionPlanForSymbol } from '../signRotation.js';
import {
	recognitionKey,
	scoreRecognitionExample,
	type RecognitionExample
} from '../shape-matcher/index.js';
import type {
	AppConfig,
	Dictionary,
	DictionaryEntry,
	RecognitionKind,
	RecognitionStatus,
	SymbolCandidate,
	TemplateMatch
} from '../../types.js';
import {
	DECOMPOSITION_DOMINANT_SIGIL_SCORE,
	REGION_FLAT_CONFIDENCE_CAP,
	REGION_SIGN_ID,
	SIMPLE_SIGN_MIN_TEMPLATE_COVERAGE,
	SIMPLE_SIGN_STROKE_LIMIT,
	SIMPLE_SIGN_STRUCTURAL_FLOOR_CONFIDENCE,
	SIMPLE_SIGN_STRUCTURAL_FLOOR_SCORE,
	SIMPLE_SIGN_STRUCTURAL_FLOOR_STROKE_LIMIT
} from './constants.js';
import { candidateFeatures, structuralCompatibility } from './features.js';
import { recognitionExamplesFor } from './examples.js';
import { allowedLayerScore, entryStrokeTemplate, rangeScore } from './thresholds.js';
import type {
	CandidateFeatures,
	DecompositionScorer,
	PrecomputedExampleScore,
	RecognitionThresholds,
	ScoredEntry,
	ScoredTemplate
} from './types.js';

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

/** Determines the public recognition status once dictionary scores are sorted. */
export function recognitionStatus(
	candidate: SymbolCandidate,
	best: ScoredEntry | undefined,
	second: { confidence?: number },
	secondSameKind: { confidence?: number },
	accepted: boolean,
	thresholds: RecognitionThresholds
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

/** Scores one candidate against one dictionary entry/example pair. */
export function scoreByStrokeTemplate(
	kind: RecognitionKind,
	entry: DictionaryEntry,
	example: RecognitionExample,
	candidate: SymbolCandidate,
	features: CandidateFeatures,
	thresholds: RecognitionThresholds,
	precomputed?: PrecomputedExampleScore
): ScoredTemplate {
	const layerScore = allowedLayerScore(entry, candidate);
	const strokeTemplate = entryStrokeTemplate(entry);

	if (!strokeTemplate?.strokes?.length) {
		return {
			confidence: 0,
			templateMatch: null,
			structuralMatch: null,
			matcher: null
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
	const matcherConfidence = clamp(matcher.pScore * 0.45 + matcher.chamferScore * 0.35);
	const rawTemplateMatch: TemplateMatch = {
		available: matcher.available,
		confidence: matcherConfidence,
		rotationDeg: matcher.rotationDeg,
		recognitionRotationDeg: matcher.recognitionRotationDeg,
		$pDistance: matcher.$pDistance,
		pScore: matcher.pScore,
		chamferDistance: matcher.chamferDistance,
		chamferScore: matcher.chamferScore,
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
	const simpleSignStructuralFloor =
		kind === 'sign' &&
		entry.id !== REGION_SIGN_ID &&
		candidate.layer !== 'center' &&
		structuralMatch.templateStrokeCount <= SIMPLE_SIGN_STRUCTURAL_FLOOR_STROKE_LIMIT &&
		structuralMatch.candidateStrokeCount === structuralMatch.templateStrokeCount &&
		structuralMatch.score >= SIMPLE_SIGN_STRUCTURAL_FLOOR_SCORE &&
		templateMatch.templateCoveredRatio >= 0.34 &&
		templateMatch.candidateExplainedRatio >= 0.3
			? SIMPLE_SIGN_STRUCTURAL_FLOOR_CONFIDENCE
			: 0;
	const grossStructureMismatchCap =
		structuralMatch.score < 0.18 && templateMatch.templateCoveredRatio < 0.5 ? 0.44 : 1;
	const regionGeometryCap =
		kind === 'sign' && entry.id === REGION_SIGN_ID
			? REGION_FLAT_CONFIDENCE_CAP + structuralMatch.lineSpreadScore * 0.66
			: 1;
	const contextualScore =
		templateMatch.confidence * 0.66 +
		structuralMatch.score * 0.16 +
		layerScore * 0.09 +
		sizeScore * 0.04 +
		candidate.neatness * 0.05;
	const contextLiftCap = templateMatch.confidence + 0.04;
	return {
		confidence: Math.max(
			Math.min(
				clamp(Math.min(contextualScore, contextLiftCap) * simpleSignStructureMultiplier),
				simpleSignIncompleteCap,
				grossStructureMismatchCap,
				regionGeometryCap
			),
			simpleSignStructuralFloor
		),
		templateMatch,
		structuralMatch,
		matcher
	};
}

/** Strips stroke geometry from a candidate before embedding it in diagnostics. */
export function publicCandidate(candidate: SymbolCandidate) {
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

/**
 * Creates the lightweight scorer used by recognition-guided stroke decomposition.
 *
 * It deliberately skips status and structural blending so tree nodes can be
 * scored cheaply while the user draws.
 */
export function createDecompositionScorer(
	dictionary: Dictionary,
	_config: AppConfig,
	recognitionExamples: RecognitionExample[] = []
): DecompositionScorer {
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
		const layerScore = allowedLayerScore(group.entry, candidate);
		if (layerScore < 0.5) {
			return 0;
		}
		const plan = recognitionPlanForSymbol(group.kind, group.entry, candidate);
		let best = 0;
		for (const example of group.examples) {
			const matcher = scoreRecognitionExample(plan.candidate.strokes, example, plan.options);
			if (matcher.confidence > best) {
				best = matcher.confidence;
			}
		}
		return best * layerScore;
	};

	const nodeScoreCache = scopedLruCache<number>(
		dictionary,
		`decomposition:${allExamples.map((example) => example.id).join(',')}`,
		2048
	);

	return (candidate: SymbolCandidate): number => {
		const cacheKey = candidateContentKey(candidate);
		const cached = nodeScoreCache.get(cacheKey);
		if (cached !== undefined) {
			return cached;
		}
		let best = 0;
		for (const group of sigilEntries) {
			const score = bestEntryScore(group, candidate);
			if (score > best) {
				best = score;
			}
		}
		if (best < DECOMPOSITION_DOMINANT_SIGIL_SCORE) {
			for (const group of signEntries) {
				const score = bestEntryScore(group, candidate);
				if (score > best) {
					best = score;
				}
			}
		}
		nodeScoreCache.set(cacheKey, best);
		return best;
	};
}
