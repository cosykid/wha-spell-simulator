import { angleDegFromCenter, degreesToRadians, distance } from '../../utils/geometry.js';
import type { RingGap, Stroke } from '../../types.js';
import {
	OPEN_COVERAGE_HALF_WIDTH_PX,
	OPEN_COVERAGE_HALF_WIDTH_RATIO,
	RING_BIN_COUNT,
	STROKE_SAMPLE_STEP_PX
} from './constants.js';
import type { Circle, StrokeCircleMetrics } from './types.js';

function markAngle(bins: boolean[], angleDeg: number): void {
	const bin = Math.floor((angleDeg / 360) * bins.length) % bins.length;
	bins[bin] = true;
}

function largestGap(bins: boolean[]): RingGap {
	const size = bins.length;
	let bestStart = 0;
	let bestLength = 0;
	let currentStart = 0;
	let currentLength = 0;

	for (let index = 0; index < size * 2; index += 1) {
		const bin = bins[index % size];
		if (!bin) {
			if (currentLength === 0) {
				currentStart = index;
			}
			currentLength += 1;
			if (currentLength > bestLength && currentLength <= size) {
				bestStart = currentStart;
				bestLength = currentLength;
			}
		} else {
			currentLength = 0;
		}
	}

	const binDegrees = 360 / size;
	return {
		startAngle: (bestStart % size) * binDegrees,
		endAngle: ((bestStart + bestLength) % size) * binDegrees,
		sizeDegrees: bestLength * binDegrees
	};
}

function openCoverageHalfWidth(radius: number): number {
	return Math.max(OPEN_COVERAGE_HALF_WIDTH_PX, radius * OPEN_COVERAGE_HALF_WIDTH_RATIO);
}

/** Measures how much of a stroke tracks a candidate circle. */
export function strokeCircleMetrics(
	stroke: Stroke,
	circle: Circle,
	bins: boolean[] | null = null
): StrokeCircleMetrics {
	const halfWidth = openCoverageHalfWidth(circle.radius);
	const sampleStep = STROKE_SAMPLE_STEP_PX;
	let totalLength = 0;
	let nearLength = 0;

	for (let index = 1; index < stroke.points.length; index += 1) {
		const previous = stroke.points[index - 1];
		const current = stroke.points[index];
		const segmentLength = distance(previous, current);
		if (segmentLength <= 0) {
			continue;
		}

		const steps = Math.max(1, Math.ceil(segmentLength / sampleStep));
		const sampleLength = segmentLength / steps;
		totalLength += segmentLength;

		for (let step = 1; step <= steps; step += 1) {
			const t = step / steps;
			const point = {
				x: previous.x + (current.x - previous.x) * t,
				y: previous.y + (current.y - previous.y) * t
			};
			const nearCircle = Math.abs(distance(point, circle.center) - circle.radius) <= halfWidth;
			if (nearCircle) {
				nearLength += sampleLength;
				if (bins) {
					markAngle(bins, angleDegFromCenter(point, circle.center));
				}
			}
		}
	}

	return {
		totalLength,
		nearLength,
		nearRatio: totalLength > 0 ? nearLength / totalLength : 0
	};
}

/** Measures angular coverage and largest gap for an open ring candidate. */
export function measureOpenCoverage(strokes: Stroke[], circle: Circle) {
	const bins: boolean[] = new Array(RING_BIN_COUNT).fill(false);
	let nearLength = 0;
	let totalLength = 0;

	for (const stroke of strokes) {
		const metrics = strokeCircleMetrics(stroke, circle, bins);
		nearLength += metrics.nearLength;
		totalLength += metrics.totalLength;
	}

	const coverageBins = bins.flatMap((covered, index) => (covered ? [index] : []));
	const coverageRatio = coverageBins.length / Math.max(1, bins.length);
	const gap = largestGap(bins);

	return {
		coverageRatio,
		gap,
		gapArcLength: degreesToRadians(gap.sizeDegrees) * circle.radius,
		nearCircleInkRatio: totalLength > 0 ? nearLength / totalLength : 0
	};
}

/** Angular coverage for a single stroke against a circle. */
export function strokeAngularCoverage(stroke: Stroke, circle: Circle) {
	const bins: boolean[] = new Array(RING_BIN_COUNT).fill(false);
	const metrics = strokeCircleMetrics(stroke, circle, bins);
	const coveredBinCount = bins.filter(Boolean).length;
	return {
		...metrics,
		coveredBinCount,
		angularSpanDeg: coveredBinCount * (360 / Math.max(1, bins.length))
	};
}
