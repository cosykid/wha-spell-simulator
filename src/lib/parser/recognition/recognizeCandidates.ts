import { normalizeAngleDeg } from '../../utils/geometry.js';
import { candidateContentKey, scopedLruCache, type LruCache } from '../recognitionMemo.js';
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
	RecognitionBestGuess,
	RecognitionKind,
	RecognitionStatus,
	RecognizedSymbol,
	SymbolCandidate,
	TopMatch
} from '../../types.js';
import { candidateFeatures } from './features.js';
import { recognitionExamplesFor } from './examples.js';
import { allowedLayerScore, recognitionThresholds } from './thresholds.js';
import { publicCandidate, recognitionStatus, scoreByStrokeTemplate } from './scoring.js';
import type {
	CandidateFeatures,
	PrecomputedExampleScore,
	RecognitionThresholds,
	ScoredEntry
} from './types.js';

interface RecognitionEntry {
	kind: RecognitionKind;
	entry: DictionaryEntry;
	examples: RecognitionExample[];
}

interface RecognitionContext {
	entries: RecognitionEntry[];
	thresholds: RecognitionThresholds;
	resultCache: LruCache<RecognizedSymbol>;
}

interface RecognitionDecision {
	accepted: boolean;
	status: RecognitionStatus;
	best: ScoredEntry | undefined;
	topMatches: TopMatch[];
	bestGuess: RecognitionBestGuess | null;
}

function examplesByRecognitionKey(
	examples: RecognitionExample[]
): Map<string, RecognitionExample[]> {
	const byKey = new Map<string, RecognitionExample[]>();
	for (const example of examples) {
		const key = recognitionKey(example.kind, example.symbolId);
		byKey.set(key, [...(byKey.get(key) ?? []), example]);
	}
	return byKey;
}

function recognitionEntriesFor(
	dictionary: Dictionary,
	examplesByKey: Map<string, RecognitionExample[]>
): RecognitionEntry[] {
	return [
		...dictionary.sigils.flatMap((entry) => {
			const examples = examplesByKey.get(recognitionKey('sigil', entry.id)) ?? [];
			return examples.length ? [{ kind: 'sigil' as const, entry, examples }] : [];
		}),
		...dictionary.signs.flatMap((entry) => {
			const examples = examplesByKey.get(recognitionKey('sign', entry.id)) ?? [];
			return examples.length ? [{ kind: 'sign' as const, entry, examples }] : [];
		})
	];
}

function recognitionResultCache(
	dictionary: Dictionary,
	examples: RecognitionExample[],
	thresholds: RecognitionThresholds
): LruCache<RecognizedSymbol> {
	return scopedLruCache<RecognizedSymbol>(
		dictionary,
		`recognize:${examples.map((example) => example.id).join(',')}:${JSON.stringify(thresholds)}`,
		256
	);
}

function buildRecognitionContext(
	dictionary: Dictionary,
	config: AppConfig,
	recognitionExamples: RecognitionExample[]
): RecognitionContext {
	const allExamples = recognitionExamplesFor(dictionary, recognitionExamples);
	const thresholds = recognitionThresholds(config);
	return {
		entries: recognitionEntriesFor(dictionary, examplesByRecognitionKey(allExamples)),
		thresholds,
		resultCache: recognitionResultCache(dictionary, allExamples, thresholds)
	};
}

function scoreExampleFactory(candidate: SymbolCandidate, features: CandidateFeatures) {
	const scoreCache = new Map<string, PrecomputedExampleScore>();
	return (
		kind: RecognitionKind,
		entry: DictionaryEntry,
		example: RecognitionExample
	): PrecomputedExampleScore => {
		const cached = scoreCache.get(example.id);
		if (cached) {
			return cached;
		}
		const recognitionPlan = recognitionPlanForSymbol(kind, entry, candidate);
		const matchFeatures = kind === 'sign' ? candidateFeatures(recognitionPlan.candidate) : features;
		const matcher = scoreRecognitionExample(
			recognitionPlan.candidate.strokes,
			example,
			recognitionPlan.options
		);
		const score = { recognitionPlan, matchFeatures, matcher };
		scoreCache.set(example.id, score);
		return score;
	};
}

function scoreCandidateEntries(
	candidate: SymbolCandidate,
	features: CandidateFeatures,
	context: RecognitionContext
): ScoredEntry[] {
	const scoreExample = scoreExampleFactory(candidate, features);
	return context.entries
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
						context.thresholds,
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
					matcher: null
				})
			};
		})
		.sort((a, b) => b.confidence - a.confidence);
}

function topMatchesFrom(scored: ScoredEntry[]): TopMatch[] {
	return scored.slice(0, 3).map((score) => ({
		kind: score.kind,
		id: score.entry.id,
		confidence: score.confidence,
		templateConfidence: score.templateMatch?.confidence ?? 0,
		$pDistance: score.templateMatch?.$pDistance ?? 1,
		chamferDistance: score.templateMatch?.chamferDistance ?? 1,
		inkScore: score.templateMatch?.inkScore ?? 0,
		candidateExplainedRatio: score.templateMatch?.candidateExplainedRatio ?? 0,
		templateCoveredRatio: score.templateMatch?.templateCoveredRatio ?? 0,
		structuralScore: score.structuralMatch?.score ?? 0,
		aspectScore: score.structuralMatch?.aspectScore ?? 0,
		strokeCountScore: score.structuralMatch?.strokeCountScore ?? 0,
		strokeProfileScore: score.structuralMatch?.strokeProfileScore ?? 0,
		shapeScore: score.structuralMatch?.shapeScore ?? 0,
		rotationDeg: score.templateMatch?.rotationDeg ?? 0,
		recognitionRotationDeg:
			score.templateMatch?.recognitionRotationDeg ?? score.templateMatch?.rotationDeg ?? 0
	}));
}

function decideRecognition(
	candidate: SymbolCandidate,
	scored: ScoredEntry[],
	thresholds: RecognitionThresholds
): RecognitionDecision {
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
	const acceptedByLayer = Boolean(best && allowedLayerScore(best.entry, candidate) >= 0.7);
	const status = recognitionStatus(
		candidate,
		best,
		second,
		secondSameKind,
		acceptedByConfidence && acceptedByInk && acceptedByLayer,
		thresholds
	);
	const accepted = acceptedByConfidence && (status === 'valid' || status === 'valid_messy');
	const bestGuess = best
		? {
				kind: best.kind,
				id: best.entry.id,
				confidence: best.confidence
			}
		: null;

	return {
		accepted,
		status,
		best,
		bestGuess,
		topMatches: topMatchesFrom(scored)
	};
}

function buildRecognizedSymbol(
	candidate: SymbolCandidate,
	features: CandidateFeatures,
	decision: RecognitionDecision
): RecognizedSymbol {
	const best = decision.best;
	const acceptedEntry = decision.accepted && best ? best : null;
	const bestTemplateMatch = best?.templateMatch ?? null;
	const bestStructuralMatch = best?.structuralMatch ?? null;

	return {
		...publicCandidate(candidate),
		rotationOffsetDeg: normalizeAngleDeg(
			bestTemplateMatch?.recognitionRotationDeg ?? bestTemplateMatch?.rotationDeg ?? 0
		),
		recognized: Boolean(acceptedEntry),
		recognitionStatus: decision.status,
		kind: acceptedEntry ? acceptedEntry.kind : 'unknown',
		id: acceptedEntry ? acceptedEntry.entry.id : null,
		displayName: acceptedEntry ? acceptedEntry.entry.displayName : null,
		element: acceptedEntry ? (acceptedEntry.entry.element ?? null) : null,
		semantic: acceptedEntry ? (acceptedEntry.entry.semantic ?? null) : null,
		referenceSizeNorm: acceptedEntry ? (acceptedEntry.entry.referenceSizeNorm ?? null) : null,
		confidence: acceptedEntry ? acceptedEntry.confidence : 0,
		shape: {
			strokeCount: features.strokeCount,
			aspectRatio: features.aspectRatio,
			elongation: features.elongation,
			elongationNorm: features.elongationNorm,
			strokeLengthImbalance: features.strokeLengthImbalance,
			axisDominance: features.axisDominance,
			lineSpread: features.lineSpread
		},
		diagnostics: {
			bestGuess: acceptedEntry ? null : decision.bestGuess,
			recognitionRotationDeg:
				bestTemplateMatch?.recognitionRotationDeg ?? bestTemplateMatch?.rotationDeg ?? 0,
			template: {
				$pDistance: bestTemplateMatch?.$pDistance ?? 1,
				pScore: bestTemplateMatch?.pScore ?? 0,
				chamferDistance: bestTemplateMatch?.chamferDistance ?? 1,
				chamferScore: bestTemplateMatch?.chamferScore ?? 0,
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
				candidateExplainedRatio: bestTemplateMatch?.candidateExplainedRatio ?? 0,
				templateCoveredRatio: bestTemplateMatch?.templateCoveredRatio ?? 0,
				unexplainedInkRatio: bestTemplateMatch?.unexplainedInkRatio ?? 1
			},
			structure: {
				score: bestStructuralMatch?.score ?? 0,
				aspectScore: bestStructuralMatch?.aspectScore ?? 0,
				strokeCountScore: bestStructuralMatch?.strokeCountScore ?? 0,
				strokeProfileScore: bestStructuralMatch?.strokeProfileScore ?? 0,
				shapeScore: bestStructuralMatch?.shapeScore ?? 0,
				axisScore: bestStructuralMatch?.axisScore ?? 0,
				lineSpreadScore: bestStructuralMatch?.lineSpreadScore ?? 1,
				candidateAspectRatio: bestStructuralMatch?.candidateAspectRatio ?? features.aspectRatio,
				templateAspectRatio: bestStructuralMatch?.templateAspectRatio ?? 1,
				candidateStrokeCount: bestStructuralMatch?.candidateStrokeCount ?? features.strokeCount,
				templateStrokeCount: bestStructuralMatch?.templateStrokeCount ?? 0
			},
			topMatches: decision.topMatches
		}
	};
}

function recognizeCandidate(
	candidate: SymbolCandidate,
	context: RecognitionContext
): RecognizedSymbol {
	const cacheKey = candidateContentKey(candidate);
	const cached = context.resultCache.get(cacheKey);
	if (cached) {
		return { ...cached, candidateId: candidate.candidateId, strokeIds: candidate.strokeIds };
	}

	const features = candidateFeatures(candidate);
	const scored = scoreCandidateEntries(candidate, features, context);
	const decision = decideRecognition(candidate, scored, context.thresholds);
	const result = buildRecognizedSymbol(candidate, features, decision);
	context.resultCache.set(cacheKey, result);
	return result;
}

/**
 * Scores grouped symbol candidates against the dictionary and returns public recognitions.
 *
 * The recognizer combines normalized ink matching, structural compatibility,
 * radial layer fit, and ambiguity/contamination checks. ML can later refine
 * this result, but this function is the deterministic template baseline used
 * across workers, tests, and no-ML environments.
 */
export function recognizeCandidates(
	candidates: SymbolCandidate[],
	dictionary: Dictionary,
	config: AppConfig,
	recognitionExamples: RecognitionExample[] = []
): RecognizedSymbol[] {
	const context = buildRecognitionContext(dictionary, config, recognitionExamples);
	return candidates.map((candidate) => recognizeCandidate(candidate, context));
}
