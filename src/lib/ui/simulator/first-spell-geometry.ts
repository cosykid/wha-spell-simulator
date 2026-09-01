/**
 * @file Where the first-spell guide's ghost ink lies on the paper: the ideal
 * open ring, the fire sigil fitted into a ring's center, and the short arc that
 * seals a detected gap. Pure geometry in canvas pixels, so it is unit-testable
 * and the renderer only has to trace what it is handed.
 *
 * Angles use the detector's own convention (`angleDegFromCenter`): 0° is right,
 * 90° is up, so the y coordinate is flipped when an angle becomes a point.
 */

import { SpellPresetDataSchema, type SpellPresetData } from '$lib/structures/spellPreset.js';
import type { Point, RingInfo } from '$lib/types.js';

/**
 * The ghost ring matches the construction guides' default ring
 * (guideRenderer.ts draws at `referenceSize * 0.36`), so a drawer tracing the
 * ghost is also tracing the dashed guide already on the paper.
 */
const RING_RADIUS_RATIO = 0.36;
/** The opening sits at the bottom of the ring, nearest the drawing hand. */
const RING_GAP_CENTER_DEG = 270;
/** Wide enough to read as deliberate, narrow enough to seal with one stroke. */
const RING_GAP_DEG = 40;
/** Degrees the seal ghost extends past each gap edge so its ink overlaps the ring. */
const SEAL_OVERLAP_DEG = 8;
/**
 * Sigil width and height as a share of the ring radius. A half-extent of 0.3
 * keeps every mark inside the center layer (`config.layers.centerMax` is 0.32),
 * and it matches the scale the fire template was captured at.
 */
const SIGIL_EXTENT_RATIO = 0.6;
/** Ghost arcs sample one point per this many degrees. */
const ARC_STEP_DEG = 4;

/** Everything the ghost needs to know about the canvas and the drawing. */
export interface GhostEnvironment {
	canvasWidth: number;
	canvasHeight: number;
	/** The visible short axis, the same logical paper size the guides use. */
	referenceSize: number;
	/** The detected ring, when recognition has one. */
	ring: RingInfo | undefined;
	/** The fire sigil's template strokes in the 0..1 unit box, once loaded. */
	sigilStrokes: Point[][] | null;
}

/**
 * Samples a circular arc between two angles, in the y-flipped convention noted
 * above. `endDeg` may exceed 360 to sweep past the start.
 */
export function arcStroke(
	center: Point,
	radius: number,
	startDeg: number,
	endDeg: number,
	stepDeg = ARC_STEP_DEG
): Point[] {
	const points: Point[] = [];
	for (let angle = startDeg; angle <= endDeg; angle += stepDeg) {
		const radians = (angle * Math.PI) / 180;
		points.push({
			x: center.x + radius * Math.cos(radians),
			y: center.y - radius * Math.sin(radians)
		});
	}
	const finalRadians = (endDeg * Math.PI) / 180;
	const last = points[points.length - 1];
	if (!last || Math.abs(last.x - (center.x + radius * Math.cos(finalRadians))) > 1e-6) {
		points.push({
			x: center.x + radius * Math.cos(finalRadians),
			y: center.y - radius * Math.sin(finalRadians)
		});
	}
	return points;
}

/** The ideal ring the guide asks for: centered, with the gap at the bottom. */
export function idealRing(
	env: Pick<GhostEnvironment, 'canvasWidth' | 'canvasHeight' | 'referenceSize'>
): {
	center: Point;
	radius: number;
} {
	return {
		center: { x: env.canvasWidth / 2, y: env.canvasHeight / 2 },
		radius: env.referenceSize * RING_RADIUS_RATIO
	};
}

/** The ring step's ghost: one open circle, drawn away from the bottom gap. */
export function ringGhostStrokes(env: GhostEnvironment): Point[][] {
	const { center, radius } = idealRing(env);
	const start = RING_GAP_CENTER_DEG + RING_GAP_DEG / 2;
	return [arcStroke(center, radius, start, start + 360 - RING_GAP_DEG)];
}

/** The sigil step's ghost: the fire template fitted into the ring's center. */
export function sigilGhostStrokes(env: GhostEnvironment): Point[][] {
	if (!env.sigilStrokes) {
		return [];
	}
	const ring = env.ring?.found ? env.ring : idealRing(env);
	const extent = ring.radius * SIGIL_EXTENT_RATIO;
	return env.sigilStrokes.map((stroke) =>
		stroke.map((point) => ({
			x: ring.center.x + (point.x - 0.5) * extent,
			y: ring.center.y + (point.y - 0.5) * extent
		}))
	);
}

/**
 * The seal step's ghost: a short arc across the detected ring's own gap, with a
 * little overlap past each edge so the suggested stroke visibly joins the ink.
 * Falls back to the ideal ring's bottom gap if the detector reported no gap.
 */
export function sealGhostStrokes(env: GhostEnvironment): Point[][] {
	const ring = env.ring?.found ? env.ring : idealRing(env);
	const gap = env.ring?.found ? env.ring.gap : undefined;
	const startDeg = gap ? gap.startAngle : RING_GAP_CENTER_DEG - RING_GAP_DEG / 2;
	const sizeDeg = gap ? gap.sizeDegrees : RING_GAP_DEG;
	return [
		arcStroke(
			ring.center,
			ring.radius,
			startDeg - SEAL_OVERLAP_DEG,
			startDeg + sizeDeg + SEAL_OVERLAP_DEG
		)
	];
}

/** The ghost strokes for one walk step. The cast step draws none. */
export function ghostStrokesFor(step: 'ring' | 'sigil' | 'seal', env: GhostEnvironment): Point[][] {
	switch (step) {
		case 'ring':
			return ringGhostStrokes(env);
		case 'sigil':
			return sigilGhostStrokes(env);
		case 'seal':
			return sealGhostStrokes(env);
	}
}

/**
 * The practice spell, for a drawer the recognizer keeps refusing: the ideal
 * open ring plus the fire sigil, as a v1 preset `loadPreset` can land. The ring
 * ships open, so the drawer still seals it — the cast stays theirs.
 */
export function buildFirstSpellPractice(
	env: Pick<GhostEnvironment, 'canvasWidth' | 'canvasHeight' | 'referenceSize'>,
	sigilStrokes: Point[][]
): SpellPresetData {
	const full: GhostEnvironment = { ...env, ring: undefined, sigilStrokes };
	const strokes = [...ringGhostStrokes(full), ...sigilGhostStrokes(full)].map((points) => ({
		points: points.map((point) => ({
			x: point.x / env.canvasWidth,
			y: point.y / env.canvasWidth
		}))
	}));
	return SpellPresetDataSchema.parse({ v: 1, strokes, placements: [] });
}
