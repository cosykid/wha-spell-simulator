import { distance, strokeLength } from '../../utils/geometry.js';
import type { Point, Stroke } from '../../types.js';
import {
	GLYPH_CIRCLE_ATTACHED_MIN_LENGTH_RATIO,
	GLYPH_CIRCLE_BAND_HALF_WIDTH_MIN_PX,
	GLYPH_CIRCLE_BAND_HALF_WIDTH_RATIO,
	GLYPH_CIRCLE_CROSS_INNER_RATIO,
	GLYPH_CIRCLE_CROSS_OUTER_RATIO,
	GLYPH_CIRCLE_FAR_END_MIN_PX,
	GLYPH_CIRCLE_FAR_END_RADIUS_RATIO,
	GLYPH_CIRCLE_LOBE_AMPLITUDE_MIN_PX,
	GLYPH_CIRCLE_LOBE_AMPLITUDE_RATIO,
	GLYPH_CIRCLE_LOBE_BIN_COUNT,
	GLYPH_CIRCLE_MAX_TAIL_RATIO,
	GLYPH_CIRCLE_MIN_CROSSING_STROKES,
	GLYPH_CIRCLE_MIN_LOBE_FLIPS,
	GLYPH_CIRCLE_TAIL_WITH_CROSSING_RATIO,
	GLYPH_CIRCLE_TOUCH_MIN_PX,
	GLYPH_CIRCLE_TOUCH_RATIO
} from './constants.js';
import type { Circle, RingCandidate } from './types.js';

function strokeFarInkLength(stroke: Stroke, circle: Circle, halfWidth: number): number {
	let farLength = 0;
	for (let index = 1; index < stroke.points.length; index += 1) {
		const previous = stroke.points[index - 1];
		const current = stroke.points[index];
		const segmentLength = distance(previous, current);
		if (segmentLength <= 0) {
			continue;
		}
		const midpoint = {
			x: (previous.x + current.x) / 2,
			y: (previous.y + current.y) / 2
		};
		if (Math.abs(distance(midpoint, circle.center) - circle.radius) > halfWidth) {
			farLength += segmentLength;
		}
	}
	return farLength;
}

function strokeCrossesCircle(stroke: Stroke, circle: Circle): boolean {
	let inside = false;
	let outside = false;
	for (const point of stroke.points) {
		const radiusNorm = distance(point, circle.center) / Math.max(1, circle.radius);
		inside = inside || radiusNorm <= GLYPH_CIRCLE_CROSS_INNER_RATIO;
		outside = outside || radiusNorm >= GLYPH_CIRCLE_CROSS_OUTER_RATIO;
		if (inside && outside) {
			return true;
		}
	}
	return false;
}

function sampledPoints(stroke: Stroke, maxSamples = 40): Point[] {
	const points = stroke.points ?? [];
	if (points.length <= maxSamples) {
		return points;
	}
	const stride = Math.ceil(points.length / maxSamples);
	return points.filter(
		(_, index) => index === 0 || index === points.length - 1 || index % stride === 0
	);
}

function strokeTouchesInk(stroke: Stroke, inkPoints: Point[], tolerance: number): boolean {
	for (const point of sampledPoints(stroke)) {
		for (const inkPoint of inkPoints) {
			if (distance(point, inkPoint) <= tolerance) {
				return true;
			}
		}
	}
	return false;
}

/**
 * Tests whether the main ring stroke starts and ends away from the circle line.
 *
 * A drawn spell ring stroke begins and ends on the circle, even when sloppy.
 * An open-arc glyph like weave sweeps most of a circle but enters and exits
 * through corner ticks that sit well off the line, so a candidate whose main
 * stroke has both ends far from the circle is glyph ink.
 */
function mainStrokeEndsOffCircle(ringStrokes: Stroke[], circle: Circle): boolean {
	let main: Stroke | null = null;
	let mainLength = 0;
	for (const stroke of ringStrokes) {
		const length = strokeLength(stroke);
		if (length > mainLength) {
			main = stroke;
			mainLength = length;
		}
	}
	if (!main || main.points.length < 2) {
		return false;
	}

	const tolerance = Math.max(
		GLYPH_CIRCLE_FAR_END_MIN_PX,
		circle.radius * GLYPH_CIRCLE_FAR_END_RADIUS_RATIO
	);
	const ends = [main.points[0], main.points[main.points.length - 1]];
	return ends.every(
		(point) => Math.abs(distance(point, circle.center) - circle.radius) > tolerance
	);
}

/**
 * Counts hysteresis sign flips of the radial residual around the circle.
 *
 * A cloud-like glyph (billowing) is a closed loop of lobes: its radius swings
 * in and out several times per revolution. A hand-drawn spell ring drifts
 * slowly instead; even an ellipse-shaped one only produces four flips.
 * Residuals are averaged per angular bin first so an overdrawn ring, where two
 * passes sit at slightly different radii, does not read as oscillation.
 */
function radialLobeFlips(ringStrokes: Stroke[], circle: Circle): number {
	const sums = new Array<number>(GLYPH_CIRCLE_LOBE_BIN_COUNT).fill(0);
	const counts = new Array<number>(GLYPH_CIRCLE_LOBE_BIN_COUNT).fill(0);
	for (const stroke of ringStrokes) {
		for (const point of sampledPoints(stroke, 120)) {
			const angle = Math.atan2(point.y - circle.center.y, point.x - circle.center.x);
			const bin =
				Math.floor(((angle + Math.PI) / (Math.PI * 2)) * GLYPH_CIRCLE_LOBE_BIN_COUNT) %
				GLYPH_CIRCLE_LOBE_BIN_COUNT;
			sums[bin] += distance(point, circle.center) - circle.radius;
			counts[bin] += 1;
		}
	}

	const amplitude = Math.max(
		GLYPH_CIRCLE_LOBE_AMPLITUDE_MIN_PX,
		circle.radius * GLYPH_CIRCLE_LOBE_AMPLITUDE_RATIO
	);
	let state: 1 | -1 | 0 = 0;
	let flips = 0;
	for (let bin = 0; bin < GLYPH_CIRCLE_LOBE_BIN_COUNT; bin += 1) {
		if (!counts[bin]) {
			continue;
		}
		const residual = sums[bin] / counts[bin];
		if (residual > amplitude) {
			flips += state === 1 ? 0 : 1;
			state = 1;
		} else if (residual < -amplitude) {
			flips += state === -1 ? 0 : 1;
			state = -1;
		}
	}
	return flips;
}

/**
 * Tests whether a ring candidate is really the closed loop of a circular glyph.
 *
 * Several dictionary glyphs (billowing, repetition, water, light) contain a
 * near-circular loop that topological closure happily reports as a spell ring.
 * A deliberately drawn spell ring is bare: its strokes track the circle and
 * symbol ink floats detached inside it. A glyph loop instead carries tails that
 * leave the circle band, sibling strokes that cross the circle line, long curls
 * attached to the loop, or a lobed cloud outline whose radius oscillates, so
 * those signals separate glyph ink from a ring.
 */
export function looksLikeGlyphCircle(candidate: RingCandidate, strokes: Stroke[]): boolean {
	const circle: Circle = { center: candidate.center, radius: candidate.radius };
	const halfWidth = Math.max(
		GLYPH_CIRCLE_BAND_HALF_WIDTH_MIN_PX,
		candidate.radius * GLYPH_CIRCLE_BAND_HALF_WIDTH_RATIO
	);
	const touchTolerance = Math.max(
		GLYPH_CIRCLE_TOUCH_MIN_PX,
		candidate.radius * GLYPH_CIRCLE_TOUCH_RATIO
	);
	const ringStrokeIds = new Set(candidate.strokeIds);
	const circumference = Math.PI * 2 * Math.max(1, candidate.radius);
	const ringStrokes = strokes.filter((stroke) => ringStrokeIds.has(stroke.id));
	const ringInkPoints = ringStrokes.flatMap((stroke) => sampledPoints(stroke, 80));

	let tailLength = 0;
	let crossingStrokes = 0;
	let attachedCurls = 0;
	for (const stroke of strokes) {
		if (ringStrokeIds.has(stroke.id)) {
			tailLength += strokeFarInkLength(stroke, circle, halfWidth);
			continue;
		}
		if (strokeCrossesCircle(stroke, circle)) {
			crossingStrokes += 1;
			continue;
		}
		if (
			strokeLength(stroke) >= circumference * GLYPH_CIRCLE_ATTACHED_MIN_LENGTH_RATIO &&
			strokeTouchesInk(stroke, ringInkPoints, touchTolerance)
		) {
			attachedCurls += 1;
		}
	}

	const tailRatio = tailLength / circumference;
	return (
		tailRatio >= GLYPH_CIRCLE_MAX_TAIL_RATIO ||
		crossingStrokes >= GLYPH_CIRCLE_MIN_CROSSING_STROKES ||
		attachedCurls >= 1 ||
		(crossingStrokes >= 1 && tailRatio >= GLYPH_CIRCLE_TAIL_WITH_CROSSING_RATIO) ||
		radialLobeFlips(ringStrokes, circle) >= GLYPH_CIRCLE_MIN_LOBE_FLIPS ||
		mainStrokeEndsOffCircle(ringStrokes, circle)
	);
}
