import {
	angularDifference,
	boundsForPoints,
	clamp,
	distance,
	dominantAxisOrientationDeg,
	lineSpreadRatio,
	normalizeAngleDeg,
	pathLength,
	strokeLength
} from '../utils/geometry.js';
import { recognitionPlanForSymbol } from './signRotation.js';
import { candidateContentKey, scopedLruCache } from './recognitionMemo.js';
import {
	buildExamplesFromDictionary,
	recognitionKey,
	scoreRecognitionExample,
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
const SIMPLE_SIGN_STRUCTURAL_FLOOR_STROKE_LIMIT = 2;
const SIMPLE_SIGN_STRUCTURAL_FLOOR_SCORE = 0.86;
const SIMPLE_SIGN_STRUCTURAL_FLOOR_CONFIDENCE = 0.54;
const DECOMPOSITION_DOMINANT_SIGIL_SCORE = 0.85;
const SIMPLE_SIGN_MIN_TEMPLATE_COVERAGE = 0.78;
const REGION_SIGN_ID = 'region';
const REGION_MIN_LINE_SPREAD = 0.14;
const REGION_FULL_LINE_SPREAD = 0.26;
const REGION_FLAT_CONFIDENCE_CAP = 0.34;
const templateFeatureCache = new WeakMap<StrokeTemplate, TemplateFeatures>();
const dictionaryExampleCache = new WeakMap<Dictionary, RecognitionExample[]>();

interface ShapeSignature {
	// Arc-length fraction of the ink that runs locally straight (1 = all straight lines).
	straightness: number;
	// Arc-length fraction of the ink that lives in closed (looping) strokes.
	loopRatio: number;
}

interface TemplateFeatures {
	aspectRatio: number;
	elongation: number;
	strokeCount: number;
	orientationDeg: number;
	strokeProfile: number[];
	shapeSignature: ShapeSignature;
}

interface CandidateFeatures {
	aspectRatio: number;
	elongation: number;
	elongationNorm: number;
	strokeCount: number;
	strokeLengthImbalance: number;
	axisDominance: number;
	strokeProfile: number[];
	shapeSignature: ShapeSignature;
	lineSpread: number;
}

interface StructuralMatch {
	score: number;
	aspectScore: number;
	strokeCountScore: number;
	strokeProfileScore: number;
	shapeScore: number;
	axisScore: number;
	lineSpreadScore: number;
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
		minTemplateCoverage: recognition.minTemplateCoverage ?? 0.55
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

// Step (in bounds-normalized units) used when resampling a polyline before measuring its local
// curvature. Coarse enough that hand jitter averages out over the baseline, fine enough that a
// real arc still registers sustained turning and a sharp corner stays a single spike.
const SHAPE_RESAMPLE_STEP = 0.12;
// Turning per unit length (radians) below which a vertex is treated as "running straight".
// A smooth arc sustains turning above this across many vertices; a polygon only spikes at corners.
const STRAIGHT_CURVATURE_LIMIT = 1.1;
// Endpoint gap (as a fraction of the stroke's own path length) under which a stroke counts as a
// closed loop. Aeriform's little circles close; straight facet lines never do.
const LOOP_CLOSE_FRACTION = 0.24;

function resampleByStep(
	points: { x: number; y: number }[],
	step: number
): { x: number; y: number }[] {
	if (points.length < 2) {
		return points.slice();
	}
	const result: { x: number; y: number }[] = [points[0]];
	let carry = 0;
	for (let index = 1; index < points.length; index += 1) {
		const previous = points[index - 1];
		const current = points[index];
		const segment = distance(previous, current);
		if (segment <= 0.000001) {
			continue;
		}
		let position = carry;
		while (position + step <= segment) {
			position += step;
			const t = position / segment;
			result.push({
				x: previous.x + (current.x - previous.x) * t,
				y: previous.y + (current.y - previous.y) * t
			});
		}
		carry = position - segment;
	}
	const last = points[points.length - 1];
	if (distance(result[result.length - 1], last) > step * 0.5) {
		result.push(last);
	}
	return result;
}

function turningAngle(
	a: { x: number; y: number },
	b: { x: number; y: number },
	c: { x: number; y: number }
): number {
	const x1 = b.x - a.x;
	const y1 = b.y - a.y;
	const x2 = c.x - b.x;
	const y2 = c.y - b.y;
	const cross = x1 * y2 - y1 * x2;
	const dot = x1 * x2 + y1 * y2;
	return Math.abs(Math.atan2(cross, dot));
}

// Describes the kind of line a glyph is made of, independent of how its ink is split into
// strokes: how much of it runs straight vs. curves, and how much lives in closed loops.
// This separates angular glyphs (crystal) from flowing/looping ones (aeriform) even when both
// fill the same bounding box, which the ink-proximity matcher cannot do on its own.
function shapeSignature(strokes: Array<{ x: number; y: number }[]>): ShapeSignature {
	const polylines = strokes.filter((points) => points.length >= 2);
	if (!polylines.length) {
		return { straightness: 1, loopRatio: 0 };
	}
	const bounds = boundsForPoints(polylines.flat());
	const scale = Math.max(bounds.width, bounds.height, 0.000001);
	let straightWeight = 0;
	let curveWeight = 0;
	let totalPathLength = 0;
	let loopPathLength = 0;
	for (const polyline of polylines) {
		const normalized = polyline.map((point) => ({
			x: (point.x - bounds.minX) / scale,
			y: (point.y - bounds.minY) / scale
		}));
		const length = pathLength(normalized);
		if (length <= 0.000001) {
			continue;
		}
		totalPathLength += length;
		if (distance(normalized[0], normalized[normalized.length - 1]) < LOOP_CLOSE_FRACTION * length) {
			loopPathLength += length;
		}
		const resampled = resampleByStep(normalized, SHAPE_RESAMPLE_STEP);
		for (let index = 1; index < resampled.length - 1; index += 1) {
			const previous = resampled[index - 1];
			const current = resampled[index];
			const next = resampled[index + 1];
			const span = (distance(previous, current) + distance(current, next)) / 2;
			if (span <= 0.000001) {
				continue;
			}
			const curvature = turningAngle(previous, current, next) / span;
			if (curvature <= STRAIGHT_CURVATURE_LIMIT) {
				straightWeight += span;
			} else {
				curveWeight += span;
			}
		}
	}
	const measured = straightWeight + curveWeight;
	return {
		straightness: measured ? clamp(straightWeight / measured) : 1,
		loopRatio: totalPathLength ? clamp(loopPathLength / totalPathLength) : 0
	};
}

function shapeCompatibility(candidate: ShapeSignature, template: ShapeSignature): number {
	const straightnessScore = 1 - Math.abs(candidate.straightness - template.straightness);
	const loopScore = 1 - Math.abs(candidate.loopRatio - template.loopRatio);
	return clamp(straightnessScore * 0.7 + loopScore * 0.3);
}

function regionLineSpreadScore(
	kind: RecognitionKind,
	entry: DictionaryEntry,
	lineSpread: number
): number {
	if (kind !== 'sign' || entry.id !== REGION_SIGN_ID) {
		return 1;
	}
	return clamp(
		(lineSpread - REGION_MIN_LINE_SPREAD) /
			Math.max(0.001, REGION_FULL_LINE_SPREAD - REGION_MIN_LINE_SPREAD)
	);
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
		strokeProfile: strokeLengthProfile(strokes, (stroke) => stroke),
		shapeSignature: shapeSignature(strokes)
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
		strokeProfile: strokeLengthProfile(candidate.strokes, (stroke: Stroke) => stroke.points ?? []),
		shapeSignature: shapeSignature(candidate.strokes.map((stroke) => stroke.points ?? [])),
		lineSpread: lineSpreadRatio(candidate.strokes.flatMap((stroke) => stroke.points ?? []))
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
	const shapeScore = shapeCompatibility(features.shapeSignature, template.shapeSignature);
	const lineSpreadScore = regionLineSpreadScore(kind, entry, features.lineSpread);
	const smallSign = kind === 'sign' && template.strokeCount <= SIMPLE_SIGN_STROKE_LIMIT;
	const strokeStructureScore = smallSign
		? countScore * 0.58 + profileScore * 0.42
		: countScore * 0.24 + profileScore * 0.76;
	// For sigils, aspect ratio is near-useless (most fill a square box) while curve character is
	// the strongest style-invariant discriminator, so it carries the most weight here.
	const score =
		kind === 'sign'
			? strokeStructureScore * 0.68 + aspectScore * 0.2 + axisScore * 0.12
			: shapeScore * 0.5 + aspectScore * 0.2 + profileScore * 0.18 + countScore * 0.12;
	const cappedScore =
		kind === 'sign' && entry.id === REGION_SIGN_ID
			? Math.min(score, REGION_FLAT_CONFIDENCE_CAP + lineSpreadScore * 0.66)
			: score;

	return {
		score: clamp(cappedScore),
		aspectScore,
		strokeCountScore: countScore,
		strokeProfileScore: profileScore,
		shapeScore,
		axisScore,
		lineSpreadScore,
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

function scoreByStrokeTemplate(
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
	// Matcher confidence is the $P point-cloud and chamfer blend only. The kNN
	// example vote and the metric/embedding recognizer were removed (they return
	// once enough labeled data is collected), so the former `+ 0.20 *
	// knnVoteConfidence` term is simply dropped — deliberately NOT renormalized, so
	// the kNN headroom stays unfilled and weak/ambiguous matches keep the lower
	// confidence they had when kNN abstained.
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
// as `confidence`) and deliberately skips structural blending and status logic.
// Those richer signals are reserved for the final
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

	// Tree-cut scoring dominates recompute cost and is a pure function of the
	// candidate content, so node scores are reused across recomputes; while
	// drawing, only nodes touching the newest stroke are scored cold.
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

// Recognition scores each grouped symbol candidate against every dictionary
// sigil and sign:
// 1. Extract candidate geometry such as aspect ratio, elongation, stroke count,
//    stroke-length profile, and neatness.
// 2. For signs, rotate the candidate into the bottom-of-ring canonical frame so
//    template matching can compare shape while preserving the original
//    ring-relative orientation as spell meaning.
// 3. Score the candidate against dictionary/user examples with $P point-cloud
//    distance and chamfer distance maps.
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

	const thresholds = recognitionThresholds(config);
	// Final scoring is also pure per candidate; reusing results means a stroke
	// commit only re-scores the candidate the new stroke landed in. candidateId
	// is index-based and can shift between recomputes, so it is patched on hits.
	const resultCache = scopedLruCache<RecognizedSymbol>(
		dictionary,
		`recognize:${allExamples.map((example) => example.id).join(',')}:${JSON.stringify(thresholds)}`,
		256
	);

	return candidates.map((candidate) => {
		const cacheKey = candidateContentKey(candidate);
		const cached = resultCache.get(cacheKey);
		if (cached) {
			return { ...cached, candidateId: candidate.candidateId, strokeIds: candidate.strokeIds };
		}
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
							thresholds,
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
		const bestTemplateMatch = best?.templateMatch ?? null;
		const bestStructuralMatch = best?.structuralMatch ?? null;
		const topMatches = scored.slice(0, 3).map((score) => ({
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
		const bestGuess = best
			? {
					kind: best.kind,
					id: best.entry.id,
					confidence: best.confidence
				}
			: null;

		const result: RecognizedSymbol = {
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
				axisDominance: features.axisDominance,
				lineSpread: features.lineSpread
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
				topMatches
			}
		};
		resultCache.set(cacheKey, result);
		return result;
	});
}
