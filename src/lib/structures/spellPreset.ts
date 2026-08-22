/**
 * @file A saved spell preset: the drawn diagram (freehand strokes plus stamped
 * placements) in a canvas-size-independent form that can be stored and restored.
 *
 * Coordinates are normalized to the simulator's square canvas (0..1 of its side
 * length). Placement base strokes already live in their own unit box, so only the
 * placement transform is normalized. Point `t` values are kept verbatim.
 *
 * A preset is always stored unsealed. When the drawing is serialized while its
 * ring is closed, {@link cutRingGap} opens a gap first, so loading a preset never
 * activates the spell on its own. The gap width matches the stamped ring template
 * (see `RING_GAP_DEG` in `shapeLibrary.ts`).
 *
 * The schema is versioned to allow breaking changes later.
 */
import { z } from 'zod';

import type { Placement, RingInfo, Stroke, Vector } from '../types.js';

export const SPELL_PRESET_VERSION = 1;

/** Gap opened in a sealed ring at save time. Width matches the stamped ring template. */
export const PRESET_RING_GAP_DEG = 45;

/** Where the reopened gap sits: straight up. The stamped template's gap is at 0 degrees, so only the width matches. */
const GAP_CENTER_DEG = -90;

/** A stroke counts as part of the ring only when it stays inside this radius band. */
const RING_BAND_INNER = 0.8;
const RING_BAND_OUTER = 1.2;

/** Ring strokes are long arcs. Anything spanning less is treated as a sign on the band. */
const RING_ARC_MIN_DEG = 90;

const MAX_STROKES = 400;
const MAX_POINTS_PER_STROKE = 2000;
const MAX_PLACEMENTS = 64;
const MAX_BASE_STROKES = 32;

const finite = z.number().refine(Number.isFinite, 'must be a finite number');
/** Normalized coordinates, with slack for marks drawn slightly past the canvas edge. */
const coord = finite.refine((value) => value >= -1 && value <= 2, 'out of canvas range');
const axisScale = finite.refine(
	(value) => value !== 0 && Math.abs(value) <= 4,
	'out of scale range'
);

const PresetPointSchema = z.object({ x: coord, y: coord, t: finite.optional() });

const PresetStrokeSchema = z.object({
	points: z.array(PresetPointSchema).min(1).max(MAX_POINTS_PER_STROKE)
});

const PresetPlacementSchema = z.object({
	kind: z.enum(['sigil', 'sign', 'ring']),
	sourceId: z.string().min(1).max(64),
	baseStrokes: z
		.array(z.array(PresetPointSchema).min(1).max(MAX_POINTS_PER_STROKE))
		.min(1)
		.max(MAX_BASE_STROKES),
	transform: z.object({
		cx: coord,
		cy: coord,
		scaleX: axisScale,
		scaleY: axisScale,
		rotationDeg: finite
	})
});

export const SpellPresetDataSchema = z
	.object({
		v: z.literal(SPELL_PRESET_VERSION),
		strokes: z.array(PresetStrokeSchema).max(MAX_STROKES),
		placements: z.array(PresetPlacementSchema).max(MAX_PLACEMENTS)
	})
	.refine(
		(data) => data.strokes.length + data.placements.length > 0,
		'preset must contain at least one stroke or placement'
	);

export type SpellPresetData = z.infer<typeof SpellPresetDataSchema>;

/** The live drawing unit a preset is built from and restored to. */
export interface SpellDrawing {
	strokes: Stroke[];
	placements: Placement[];
}

interface RingGeometry {
	center: Vector;
	radius: number;
}

function angleDegAt(point: Vector, center: Vector): number {
	return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
}

function angularDistanceDeg(a: number, b: number): number {
	return Math.abs(((a - b + 540) % 360) - 180);
}

/** Degrees of the circle a point run actually covers, wraparound-safe. */
function angularExtentDeg(points: Vector[], center: Vector): number {
	if (points.length < 2) {
		return 0;
	}
	const angles = points
		.map((point) => (angleDegAt(point, center) + 360) % 360)
		.sort((a, b) => a - b);
	let largestGap = angles[0] + 360 - angles[angles.length - 1];
	for (let index = 1; index < angles.length; index += 1) {
		largestGap = Math.max(largestGap, angles[index] - angles[index - 1]);
	}
	return 360 - largestGap;
}

function isRingStroke(stroke: Stroke, ring: RingGeometry): boolean {
	if (stroke.points.length < 2 || ring.radius <= 0) {
		return false;
	}
	const inBand = stroke.points.every((point) => {
		const distance = Math.hypot(point.x - ring.center.x, point.y - ring.center.y);
		return distance >= ring.radius * RING_BAND_INNER && distance <= ring.radius * RING_BAND_OUTER;
	});
	return inBand && angularExtentDeg(stroke.points, ring.center) >= RING_ARC_MIN_DEG;
}

/**
 * Opens a gap in the strokes that form the casting ring so the diagram restores as
 * a prepared spell. Non-ring strokes pass through untouched. A ring stroke loses
 * its points inside the gap sector and splits into one stroke per surviving run.
 */
export function cutRingGap(
	strokes: Stroke[],
	ring: RingGeometry,
	gapDeg = PRESET_RING_GAP_DEG
): Stroke[] {
	const result: Stroke[] = [];
	for (const stroke of strokes) {
		if (!isRingStroke(stroke, ring)) {
			result.push(stroke);
			continue;
		}
		let run: Stroke['points'] = [];
		let runIndex = 0;
		const flush = () => {
			if (run.length >= 2) {
				result.push({ ...stroke, id: `${stroke.id}:${runIndex}`, points: run });
				runIndex += 1;
			}
			run = [];
		};
		for (const point of stroke.points) {
			const angle = angleDegAt(point, ring.center);
			if (angularDistanceDeg(angle, GAP_CENTER_DEG) <= gapDeg / 2) {
				flush();
			} else {
				run = [...run, point];
			}
		}
		flush();
	}
	return result;
}

function assertCanvasSize(canvasSize: number): void {
	if (!Number.isFinite(canvasSize) || canvasSize <= 0) {
		throw new Error(`Invalid canvas size for spell preset: ${canvasSize}`);
	}
}

/**
 * Converts a live drawing into storable preset data. Coordinates are normalized by
 * the canvas side length. When the ring is sealed, a gap is cut first so the
 * stored preset is unsealed by construction.
 */
export function serializeSpellPreset(
	drawing: SpellDrawing,
	canvasSize: number,
	ring: RingInfo | null
): SpellPresetData {
	assertCanvasSize(canvasSize);
	const sealed = Boolean(ring?.found && ring.complete);
	const strokes =
		sealed && ring
			? cutRingGap(drawing.strokes, { center: ring.center, radius: ring.radius })
			: drawing.strokes;

	return {
		v: SPELL_PRESET_VERSION,
		strokes: strokes.map((stroke) => ({
			points: stroke.points.map((point) => ({
				x: point.x / canvasSize,
				y: point.y / canvasSize,
				...(point.t !== undefined ? { t: point.t } : {})
			}))
		})),
		placements: drawing.placements.map((placement) => ({
			kind: placement.kind,
			sourceId: placement.sourceId,
			baseStrokes: placement.baseStrokes.map((points) =>
				points.map((point) => ({ x: point.x, y: point.y }))
			),
			transform: {
				cx: placement.transform.cx / canvasSize,
				cy: placement.transform.cy / canvasSize,
				scaleX: placement.transform.scaleX / canvasSize,
				scaleY: placement.transform.scaleY / canvasSize,
				rotationDeg: placement.transform.rotationDeg
			}
		}))
	};
}

/**
 * Rebuilds a live drawing from preset data at the given canvas size. Fresh stroke
 * and placement ids are minted in the formats the stores expect.
 */
export function deserializeSpellPreset(data: SpellPresetData, canvasSize: number): SpellDrawing {
	assertCanvasSize(canvasSize);
	if (data.v !== SPELL_PRESET_VERSION) {
		throw new Error(`Unsupported spell preset version: ${data.v}`);
	}

	return {
		strokes: data.strokes.map((stroke, index) => {
			const points = stroke.points.map((point) => ({
				x: point.x * canvasSize,
				y: point.y * canvasSize,
				...(point.t !== undefined ? { t: point.t } : {})
			}));
			return {
				id: `s${index + 1}`,
				points,
				startedAt: points[0]?.t,
				endedAt: points[points.length - 1]?.t
			};
		}),
		placements: data.placements.map((placement, index) => ({
			id: `p${index + 1}`,
			kind: placement.kind,
			sourceId: placement.sourceId,
			baseStrokes: placement.baseStrokes.map((points) =>
				points.map((point) => ({ x: point.x, y: point.y }))
			),
			transform: {
				cx: placement.transform.cx * canvasSize,
				cy: placement.transform.cy * canvasSize,
				scaleX: placement.transform.scaleX * canvasSize,
				scaleY: placement.transform.scaleY * canvasSize,
				rotationDeg: placement.transform.rotationDeg
			}
		}))
	};
}
