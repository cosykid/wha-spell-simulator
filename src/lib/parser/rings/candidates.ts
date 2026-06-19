import {
	allPoints,
	boundsForStrokes,
	clamp,
	distance,
	mean,
	stddev,
	strokeLength
} from '../../utils/geometry.js';
import { analyzeTopologicalClosure, type TopologyResult } from '../topology/index.js';
import type { AppConfig, RingInfo, Stroke } from '../../types.js';
import {
	FOUND_COMPLETENESS,
	MIN_CLOSURE_RELEVANT_POINT_RATIO,
	MIN_ROUNDNESS,
	MIN_SEED_LENGTH_PX,
	OPEN_COLLECTION_MIN_RATIO,
	TOPOLOGY_RING_PRUNE_COVERAGE_FLOOR,
	TOPOLOGY_RING_PRUNE_MAX_ANGULAR_SPAN_DEG,
	TOPOLOGY_RING_STROKE_MIN_NEAR_CIRCLE_LENGTH_PX,
	TOPOLOGY_RING_STROKE_MIN_NEAR_CIRCLE_RATIO
} from './constants.js';
import { fallbackCircle, fitCircle } from './circleFit.js';
import { measureOpenCoverage, strokeAngularCoverage, strokeCircleMetrics } from './coverage.js';
import type { Circle, MeasuredRing, RingCandidate } from './types.js';

/** Measures final geometry and neatness for one ring stroke set. */
export function measureRing(
	strokes: Stroke[],
	config: AppConfig,
	referenceRing: RingInfo | MeasuredRing | null = null,
	topology: TopologyResult | null = null
): MeasuredRing | null {
	const points = allPoints(strokes);
	if (points.length < 8 && !topology?.closed) {
		return null;
	}

	const fitted = points.length >= 8 ? (fitCircle(points) ?? fallbackCircle(strokes)) : null;
	const center = referenceRing?.center ?? fitted?.center ?? topology?.center;
	const radius =
		referenceRing?.radius ??
		fitted?.radius ??
		topology?.radius ??
		mean(points.map((point) => distance(point, center ?? { x: 0, y: 0 })));
	if (!center || !Number.isFinite(radius) || radius <= 0) {
		return null;
	}

	const radialDistances = points.map((point) => distance(point, center));
	const residual = topology?.closed
		? (topology.normalizedRmse ?? 0)
		: stddev(radialDistances) / Math.max(1, radius);
	const bounds: { width: number; height: number } = points.length
		? boundsForStrokes(strokes)
		: { width: radius * 2, height: radius * 2 };
	const aspect =
		Math.min(bounds.width, bounds.height) / Math.max(1, Math.max(bounds.width, bounds.height));
	const fittedRoundness = clamp((1 - residual * 3.1) * 0.78 + aspect * 0.22);
	const roundness = topology?.closed
		? (topology.perfection ?? 0)
		: (referenceRing?.roundness ?? fittedRoundness);
	const coverage = measureOpenCoverage(strokes, { center, radius });
	const complete = Boolean(topology?.closed);
	const completeness = complete ? 1 : coverage.coverageRatio;
	const circumference = Math.PI * 2 * radius;
	const inkLength = strokes.reduce((sum, stroke) => sum + strokeLength(stroke), 0);
	const overdraw = Math.max(0, inkLength / Math.max(1, circumference) - 1.08);
	const closureQuality = complete ? (topology?.perfection ?? 0) : clamp(coverage.coverageRatio);
	const lineSmoothness = clamp(
		(complete ? (topology?.perfection ?? 0) : coverage.nearCircleInkRatio) * 0.72 +
			(1 - residual) * 0.28 -
			overdraw * 0.12
	);
	const neatness = clamp(roundness * 0.42 + lineSmoothness * 0.36 + closureQuality * 0.22);

	return {
		found: true,
		center,
		radius,
		complete,
		completeness,
		coverageRatio: coverage.coverageRatio,
		gap: coverage.gap,
		gapArcLength: coverage.gapArcLength,
		roundness,
		lineSmoothness,
		neatness,
		overdrawAmount: clamp(overdraw, 0, 1),
		strokeIds: strokes.map((stroke) => stroke.id)
	};
}

function collectOpenRingStrokes(seedRing: MeasuredRing, strokes: Stroke[]): Stroke[] {
	const circle: Circle = { center: seedRing.center, radius: seedRing.radius };
	return strokes.filter((stroke) => {
		if (seedRing.strokeIds.includes(stroke.id)) {
			return true;
		}

		const metrics = strokeCircleMetrics(stroke, circle);
		return metrics.nearRatio >= OPEN_COLLECTION_MIN_RATIO;
	});
}

function pruneRedundantShortRingStrokes(
	ringStrokes: Stroke[],
	circle: Circle,
	config: AppConfig
): Stroke[] {
	let kept = [...ringStrokes];

	for (const stroke of [...ringStrokes].sort((a, b) => strokeLength(a) - strokeLength(b))) {
		if (kept.length <= 1 || !kept.some((item) => item.id === stroke.id)) {
			continue;
		}

		const coverage = strokeAngularCoverage(stroke, circle);
		if (coverage.angularSpanDeg > TOPOLOGY_RING_PRUNE_MAX_ANGULAR_SPAN_DEG) {
			continue;
		}

		const withoutStroke = kept.filter((item) => item.id !== stroke.id);
		const withoutCoverage = measureOpenCoverage(withoutStroke, circle);
		const withoutTopology = analyzeTopologicalClosure(withoutStroke, config);
		if (
			withoutCoverage.coverageRatio >= TOPOLOGY_RING_PRUNE_COVERAGE_FLOOR &&
			withoutTopology.closed
		) {
			kept = withoutStroke;
		}
	}

	return kept;
}

function collectTopologicalRingStrokes(
	strokes: Stroke[],
	topology: TopologyResult,
	config: AppConfig
): Stroke[] {
	const edgeStrokeIds = new Set(topology.strokeIds);
	const edgeStrokes = strokes.filter((stroke) => edgeStrokeIds.has(stroke.id));
	const refinedCircle: Circle = fitCircle(allPoints(edgeStrokes)) ?? {
		center: topology.center ?? { x: 0, y: 0 },
		radius: topology.radius ?? 0
	};
	const ringStrokes = edgeStrokes.filter((stroke) => {
		const metrics = strokeCircleMetrics(stroke, refinedCircle);
		return (
			metrics.nearLength >= TOPOLOGY_RING_STROKE_MIN_NEAR_CIRCLE_LENGTH_PX &&
			metrics.nearRatio >= TOPOLOGY_RING_STROKE_MIN_NEAR_CIRCLE_RATIO
		);
	});

	return ringStrokes.length
		? pruneRedundantShortRingStrokes(ringStrokes, refinedCircle, config)
		: edgeStrokes;
}

function closureRelevantStrokes(
	strokes: Stroke[],
	referenceRing: RingInfo | RingCandidate | null,
	config: AppConfig
): Stroke[] {
	if (!referenceRing?.found) {
		return strokes;
	}

	const previousRingStrokeIds = new Set(referenceRing.strokeIds ?? []);
	const boundaryRadius = referenceRing.radius * config.layers.boundaryMax;

	return strokes.filter((stroke) => {
		if (previousRingStrokeIds.has(stroke.id)) {
			return true;
		}

		const pointCount = Math.max(1, stroke.points.length);
		const insideOrBoundaryRatio =
			stroke.points.filter((point) => distance(point, referenceRing.center) <= boundaryRadius)
				.length / pointCount;

		return insideOrBoundaryRatio >= MIN_CLOSURE_RELEVANT_POINT_RATIO;
	});
}

function scoreCandidate(ring: MeasuredRing | null, config: AppConfig): number {
	if (!ring || ring.radius < config.ring.minRadius) {
		return 0;
	}
	const radiusScore = clamp((ring.radius - config.ring.minRadius) / 180);
	const closureBonus = ring.complete ? 0.3 : 0;
	return clamp(
		ring.completeness * 0.38 +
			ring.roundness * 0.25 +
			ring.neatness * 0.19 +
			radiusScore * 0.08 +
			closureBonus,
		0,
		1.3
	);
}

/** Adds a closed-ring topology candidate when flood-fill detects one. */
export function addTopologicalCandidate(
	candidates: RingCandidate[],
	strokes: Stroke[],
	config: AppConfig
): TopologyResult {
	const topology = analyzeTopologicalClosure(strokes, config);
	if (topology.closed) {
		const ringStrokes = collectTopologicalRingStrokes(strokes, topology, config);
		const measured = measureRing(
			ringStrokes.length ? ringStrokes : strokes,
			config,
			null,
			topology
		);
		const score = scoreCandidate(measured, config);
		if (measured && score > 0) {
			candidates.push({
				...measured,
				score
			});
		}
	}

	return topology;
}

/** Finds open-ring candidates by fitting circles to long seed strokes. */
export function buildOpenRingCandidates(strokes: Stroke[], config: AppConfig): RingCandidate[] {
	const candidates: RingCandidate[] = [];
	const seeds = strokes.filter((stroke) => {
		const length = stroke.metrics?.length ?? strokeLength(stroke);
		const bounds = stroke.metrics?.bounds ?? boundsForStrokes([stroke]);
		const diagonal = Math.hypot(bounds.width, bounds.height);
		return length >= MIN_SEED_LENGTH_PX && diagonal >= config.ring.minRadius * 1.35;
	});

	for (const seed of seeds) {
		const firstPass = measureRing([seed], config);
		if (!firstPass) {
			continue;
		}
		const ringStrokes = collectOpenRingStrokes(firstPass, strokes);
		const measured = measureRing(ringStrokes, config, firstPass);
		const score = scoreCandidate(measured, config);
		if (
			measured &&
			score > 0 &&
			measured.completeness >= FOUND_COMPLETENESS &&
			measured.roundness >= MIN_ROUNDNESS
		) {
			candidates.push({
				...measured,
				score
			});
		}
	}

	return candidates;
}

/** Retries closure using only strokes relevant to a previous or open reference ring. */
export function addReferenceFilteredClosureCandidate(
	candidates: RingCandidate[],
	strokes: Stroke[],
	reference: RingInfo | RingCandidate | null,
	config: AppConfig
): boolean {
	if (!reference) {
		return false;
	}

	const relevantStrokes = closureRelevantStrokes(strokes, reference, config);
	if (relevantStrokes.length === strokes.length || relevantStrokes.length < 2) {
		return false;
	}

	const previousCandidateCount = candidates.length;
	addTopologicalCandidate(candidates, relevantStrokes, config);
	return candidates.length > previousCandidateCount;
}

/** Best incomplete open-ring candidate, used as a closure reference. */
export function bestOpenRingCandidate(openCandidates: RingCandidate[]): RingCandidate | null {
	return (
		[...openCandidates]
			.filter((candidate) => !candidate.complete)
			.sort((a, b) => b.score + b.radius * 0.001 - (a.score + a.radius * 0.001))[0] ?? null
	);
}
