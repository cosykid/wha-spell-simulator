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
} from '../../utils/geometry.js';
import type {
	DictionaryEntry,
	RecognitionKind,
	Stroke,
	StrokeTemplate,
	SymbolCandidate,
	TemplateMatch
} from '../../types.js';
import {
	LOOP_CLOSE_FRACTION,
	REGION_FLAT_CONFIDENCE_CAP,
	REGION_FULL_LINE_SPREAD,
	REGION_MIN_LINE_SPREAD,
	REGION_SIGN_ID,
	SHAPE_RESAMPLE_STEP,
	SIMPLE_SIGN_STROKE_LIMIT,
	STRAIGHT_CURVATURE_LIMIT
} from './constants.js';
import type {
	CandidateFeatures,
	ShapeSignature,
	StructuralMatch,
	TemplateFeatures
} from './types.js';

const templateFeatureCache = new WeakMap<StrokeTemplate, TemplateFeatures>();

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

/** Returns cached dictionary-template features for structural matching. */
export function templateFeatures(strokeTemplate: StrokeTemplate): TemplateFeatures {
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

/** Extracts structural features used by the recognizer for one grouped candidate. */
export function candidateFeatures(candidate: SymbolCandidate): CandidateFeatures {
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

/** Blends candidate/template structural features into a compatibility score. */
export function structuralCompatibility(
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
