import { distance } from '../../utils/geometry.js';
import type { AppConfig, RingInfo, Stroke, UnsupportedRing } from '../../types.js';
import {
	ACTIVATION_COMPLETENESS_FLOOR,
	MIN_COMPLETE_RADIUS_VS_REFERENCE_RATIO,
	SAME_RING_CENTER_DISTANCE_RATIO,
	SAME_RING_RADIUS_RATIO
} from './constants.js';
import { looksLikeGlyphCircle } from './glyphCircle.js';
import {
	addReferenceFilteredClosureCandidate,
	addTopologicalCandidate,
	bestOpenRingCandidate,
	buildOpenRingCandidates
} from './candidates.js';
import type { RingCandidate } from './types.js';

function closureReferenceRing(
	previousRing: RingInfo | null,
	openCandidates: RingCandidate[]
): RingInfo | RingCandidate | null {
	if (previousRing?.found && !previousRing.complete) {
		return previousRing;
	}
	return bestOpenRingCandidate(openCandidates);
}

interface RingGeometry {
	center: RingCandidate['center'];
	radius: number;
}

function isSamePhysicalRing(a: RingGeometry, b: RingGeometry): boolean {
	const averageRadius = Math.max(1, (a.radius + b.radius) / 2);
	const centerDistance = distance(a.center, b.center);
	const radiusRatio = Math.abs(a.radius - b.radius) / averageRadius;
	return (
		centerDistance <= averageRadius * SAME_RING_CENTER_DISTANCE_RATIO &&
		radiusRatio <= SAME_RING_RADIUS_RATIO
	);
}

function distinctRingCandidates(candidates: RingCandidate[]): RingCandidate[] {
	const distinct: RingCandidate[] = [];
	for (const candidate of candidates) {
		if (!distinct.some((existing) => isSamePhysicalRing(existing, candidate))) {
			distinct.push(candidate);
		}
	}
	return distinct;
}

function summarizeUnsupportedRing(candidate: RingCandidate): UnsupportedRing {
	return {
		center: candidate.center,
		radius: candidate.radius,
		complete: candidate.complete,
		completeness: candidate.completeness,
		strokeIds: candidate.strokeIds
	};
}

/**
 * Detects the spell ring from cleaned strokes.
 *
 * The detector combines open-ring circle fitting with topological closure:
 * first it finds prepared rings, then it performs flood-fill closure with a
 * filtered retry when a previous/open ring gives a good reference. Candidates
 * whose ink reads as a circular glyph, and complete circles well inside an
 * established larger ring, are rejected so glyph loops cannot steal the ring.
 */
export function detectRing(
	strokes: Stroke[],
	previousRing: RingInfo | null,
	config: AppConfig
): RingInfo {
	const candidates: RingCandidate[] = [];

	const openCandidates = buildOpenRingCandidates(strokes, config);

	const reference = closureReferenceRing(previousRing, openCandidates);
	const filteredClosureFound = addReferenceFilteredClosureCandidate(
		candidates,
		strokes,
		reference,
		config
	);
	if (!filteredClosureFound) {
		addTopologicalCandidate(candidates, strokes, config);
	}
	candidates.push(...openCandidates);

	// A circular glyph (billowing, repetition, a water/light loop) closes just
	// like a spell ring. Drop candidates whose ink reads as glyph rather than
	// ring so they classify as symbol strokes instead of stealing the ring.
	let plausible = candidates.filter((candidate) => !looksLikeGlyphCircle(candidate, strokes));

	// A closed circle well inside an established larger ring is glyph ink even
	// when it is bare; the reference ring keeps its identity.
	const sizeReference = previousRing?.found ? previousRing : bestOpenRingCandidate(openCandidates);
	if (sizeReference?.radius) {
		plausible = plausible.filter(
			(candidate) =>
				!candidate.complete ||
				candidate.radius >= sizeReference.radius * MIN_COMPLETE_RADIUS_VS_REFERENCE_RATIO ||
				isSamePhysicalRing(candidate, sizeReference)
		);
	}

	if (!plausible.length) {
		return {
			found: false,
			complete: false,
			completeness: 0,
			activationEvent: false,
			strokeIds: [],
			unsupportedNestedRings: [],
			center: { x: 0, y: 0 },
			radius: 0
		};
	}

	plausible.sort(
		(a, b) =>
			Number(b.complete) - Number(a.complete) ||
			b.score + b.radius * 0.001 - (a.score + a.radius * 0.001)
	);
	const distinctRings = distinctRingCandidates(plausible);
	const ring = distinctRings[0];
	const unsupportedMultipleRings = distinctRings.slice(1).map(summarizeUnsupportedRing);
	const unsupportedNestedRings = distinctRings
		.slice(1)
		.filter(
			(candidate) =>
				candidate.radius < ring.radius * 0.78 && candidate.roundness >= 0.68 && candidate.complete
		)
		.map(summarizeUnsupportedRing);

	const activationEvent = Boolean(
		previousRing?.found &&
		!previousRing.complete &&
		ring.complete &&
		(previousRing.completeness ?? 0) >= ACTIVATION_COMPLETENESS_FLOOR &&
		unsupportedMultipleRings.length === 0
	);

	return {
		...ring,
		activationEvent,
		unsupportedNestedRings,
		unsupportedMultipleRings
	};
}
