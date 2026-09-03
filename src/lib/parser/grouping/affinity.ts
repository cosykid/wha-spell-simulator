/**
 * @file Stroke affinity: how strongly two strokes want to share one glyph.
 *
 * Affinity is the geometric prior behind grouping. It is 1 for touching ink and
 * decays to 0 at `AFFINITY_REACH_NORM` ring radii, with two domain priors on
 * top: ink drawn inside another stroke's footprint belongs with it, and ink in
 * the center layer belongs to the one sigil that sits there.
 */
import { centerOfBounds, clamp, distance } from '../../utils/geometry.js';
import { summarizePolar } from '../coordinateNormalizer.js';
import type { AppConfig, Bounds, CleanedStroke, RingInfo } from '../../types.js';
import {
	AFFINITY_FALLOFF,
	AFFINITY_REACH_NORM,
	CENTER_AFFINITY,
	CENTER_AFFINITY_DISTANCE_NORM,
	ENCLOSED_AFFINITY,
	ENCLOSURE_PAD_NORM
} from './constants.js';
import { boundsGap, pointDistance } from './proximity.js';
import type { AffinityMatrix } from './types.js';

function extent(stroke: CleanedStroke): number {
	return Math.max(stroke.metrics.bounds.width, stroke.metrics.bounds.height);
}

function encloses(outer: Bounds, inner: Bounds, pad: number): boolean {
	return (
		inner.minX >= outer.minX - pad &&
		inner.maxX <= outer.maxX + pad &&
		inner.minY >= outer.minY - pad &&
		inner.maxY <= outer.maxY + pad
	);
}

function sharesCenter(a: CleanedStroke, b: CleanedStroke, ring: RingInfo, config: AppConfig) {
	const aCenter = centerOfBounds(a.metrics.bounds);
	const bCenter = centerOfBounds(b.metrics.bounds);
	const centerReach = config.layers.centerMax + config.layers.boundaryTolerance * 1.5;
	const bothCenter =
		summarizePolar(aCenter, ring, config).radiusNorm <= centerReach &&
		summarizePolar(bCenter, ring, config).radiusNorm <= centerReach;
	return (
		bothCenter &&
		distance(aCenter, bCenter) <= Math.max(1, ring.radius) * CENTER_AFFINITY_DISTANCE_NORM
	);
}

/** Affinity in [0, 1] between two strokes under one ring. */
export function strokeAffinity(
	a: CleanedStroke,
	b: CleanedStroke,
	ring: RingInfo,
	config: AppConfig
): number {
	const radius = Math.max(1, ring.radius);
	const reach = radius * AFFINITY_REACH_NORM;
	let affinity =
		boundsGap(a, b) <= reach ? clamp(1 - pointDistance(a, b) / reach) ** AFFINITY_FALLOFF : 0;

	const [small, large] = extent(a) <= extent(b) ? [a, b] : [b, a];
	if (encloses(large.metrics.bounds, small.metrics.bounds, radius * ENCLOSURE_PAD_NORM)) {
		affinity = Math.max(affinity, ENCLOSED_AFFINITY);
	}
	if (sharesCenter(a, b, ring, config)) {
		affinity = Math.max(affinity, CENTER_AFFINITY);
	}
	return affinity;
}

/** All-pairs affinity for a stroke list. The diagonal is 0. */
export function affinityMatrix(
	strokes: CleanedStroke[],
	ring: RingInfo,
	config: AppConfig
): AffinityMatrix {
	const matrix = strokes.map(() => strokes.map(() => 0));
	for (let a = 0; a < strokes.length; a += 1) {
		for (let b = a + 1; b < strokes.length; b += 1) {
			const affinity = strokeAffinity(strokes[a], strokes[b], ring, config);
			matrix[a][b] = affinity;
			matrix[b][a] = affinity;
		}
	}
	return matrix;
}
